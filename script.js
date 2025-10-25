// --- DOM Elements ---
const modeSelect = document.getElementById('mode-select');
const numbersInput = document.getElementById('numbers');
const targetInput = document.getElementById('target');
const levelSelect = document.getElementById('level-select');
const solveButton = document.getElementById('solve-button');
const resultsDiv = document.getElementById('results');
const loadingSpinner = document.getElementById('loading-spinner');

// --- Global Caches ---
// allSubsetResults จะเก็บผลลัพธ์ของทุกเซ็ตย่อย
// Key: "1,2,4" (sorted string)
// Value: Map<number, SolutionInfo>
let allSubsetResults = new Map();

// --- Constants ---
const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, 'root': 3 };
const MAX_FACTORIAL = 9; // 9! = 362,880. 10! ใหญ่เกินไป
const MAX_POWER_BASE = 12;
const MAX_POWER_EXP = 7;
const MAX_SIGMA_RANGE = 15; // ป้องกัน (i=1 to 100)

// --- SolutionInfo Class ---
// นี่คือหัวใจของความ "ฉลาด"
// มันเก็บมากกว่าแค่สตริง แต่เก็บ "วิธี" ที่ได้มาด้วย
class SolutionInfo {
    constructor(value, expr, precedence, opCount, level, numbers) {
        this.value = value;
        this.expr = expr;
        this.precedence = precedence; // 0=number, 1= +/-, 2= */, 3= ^/root, 99=()
        this.opCount = opCount;
        this.level = level; // B=0, 1=1, 2=2, 3=3
        this.numbers = numbers; // Array of numbers used
    }
}

// --- Event Listener ---
solveButton.addEventListener('click', handleSolve);

// --- Main Handler ---
async function handleSolve() {
    // 1. Get and Validate Inputs
    const levelName = levelSelect.value;
    const levelMap = { 'B': 0, '1': 1, '2': 2, '3': 3 };
    const level = levelMap[levelName];
    const target = parseInt(targetInput.value, 10);
    
    const nums = numbersInput.value
        .split(/[\s,]+/)
        .filter(n => n !== '')
        .map(n => parseInt(n, 10));

    if (nums.some(isNaN) || isNaN(target)) {
        displayError("กรุณาใส่ตัวเลขและเป้าหมายให้ถูกต้อง");
        return;
    }

    const expectedCount = modeSelect.value === '5' ? 5 : 4;
    if (nums.length !== expectedCount) {
        displayError(`โหมดนี้ต้องใช้ตัวเลข ${expectedCount} ตัว`);
        return;
    }

    // 2. Start Solver
    resultsDiv.innerHTML = "";
    loadingSpinner.classList.remove('hidden');
    allSubsetResults.clear(); // ล้างแคชเก่า

    // ใช้ requestAnimationFrame เพื่อให้ UI (spinner) อัปเดตก่อนเริ่มงานหนัก
    await new Promise(resolve => requestAnimationFrame(resolve));

    // 3. Run the Dynamic Programming Solver
    // นี่คือการคำนวณหลัก: หาผลลัพธ์ของทุกเซ็ตย่อย
    await solveAllSubsets(nums, level);

    // 4. Get solutions
    let allSolutions = [];
    const mainKey = nums.sort((a, b) => a - b).join(',');
    const mainResults = allSubsetResults.get(mainKey) || new Map();

    for (const [value, sol] of mainResults) {
        allSolutions.push({ ...sol, diff: Math.abs(sol.value - target), type: 'normal' });
    }
    
    // 5. Try Sigma Solver (if Lv.3)
    if (level === 3) {
        const sigmaSolutions = await solveSigma(nums, target);
        allSolutions.push(...sigmaSolutions);
    }
    
    // 6. Display Results
    loadingSpinner.classList.add('hidden');
    displaySolutions(allSolutions, target);
}

// --- Dynamic Programming Core ---
// ฟังก์ชันนี้จะเรียก solveSubsetRecursive สำหรับทุกเซ็ตย่อย
async function solveAllSubsets(numbers, level) {
    const sortedKey = numbers.sort((a, b) => a - b).join(',');
    if (!allSubsetResults.has(sortedKey)) {
        await solveSubsetRecursive(numbers, level);
    }
}

// นี่คือ Solver หลักที่ทำงานแบบ Recursive + Memoization
// มันจะคำนวณและเก็บผลลัพธ์ลงใน allSubsetResults
async function solveSubsetRecursive(numbers, level) {
    const key = numbers.sort((a, b) => a - b).join(',');
    if (allSubsetResults.has(key)) {
        return allSubsetResults.get(key);
    }

    const results = new Map();

    // Base Case: [n]
    if (numbers.length === 1) {
        const n = numbers[0];
        addSolution(results, new SolutionInfo(n, `${n}`, 99, 0, 0, [n]));
        
        // Unary Ops (Lv.2, 3) on base numbers
        await applyUnaryOps(results, level, [n]);
        
        allSubsetResults.set(key, results);
        return results;
    }

    // Recursive Step: Partition [A, B]
    const n = numbers.length;
    // (1 << n) / 2 -> วนลูปหาพาร์ติชันทั้งหมดโดยไม่ซ้ำซ้อน
    for (let i = 1; i < (1 << n) / 2; i++) {
        const part1 = [];
        const part2 = [];
        for (let j = 0; j < n; j++) {
            if ((i >> j) & 1) {
                part1.push(numbers[j]);
            } else {
                part2.push(numbers[j]);
            }
        }

        // แก้ไขพาร์ติชันย่อยก่อน
        const results1 = await solveSubsetRecursive(part1, level);
        const results2 = await solveSubsetRecursive(part2, level);

        // Combine results
        for (const [v1, s1] of results1) {
            for (const [v2, s2] of results2) {
                const newOpCount = s1.opCount + s2.opCount + 1;
                const newNumbers = [...s1.numbers, ...s2.numbers];
                
                // --- Add (Lv.B) ---
                addSolution(results, combine(s1, s2, '+', v1 + v2, 0, newOpCount, newNumbers));

                // --- Subtract (Lv.B) ---
                if (v1 - v2 >= 0) { // กฎห้ามติดลบ
                    addSolution(results, combine(s1, s2, '-', v1 - v2, 0, newOpCount, newNumbers));
                }
                if (v2 - v1 >= 0) { // กฎห้ามติดลบ
                    addSolution(results, combine(s2, s1, '-', v2 - v1, 0, newOpCount, newNumbers));
                }

                // --- Multiply (Lv.B) ---
                addSolution(results, combine(s1, s2, '*', v1 * v2, 0, newOpCount, newNumbers));

                // --- Divide (Lv.B) ---
                if (v2 !== 0 && v1 % v2 === 0) { // กฎห้ามทศนิยม
                    addSolution(results, combine(s1, s2, '/', v1 / v2, 0, newOpCount, newNumbers));
                }
                if (v1 !== 0 && v2 % v1 === 0) { // กฎห้ามทศนิยม
                    addSolution(results, combine(s2, s1, '/', v2 / v1, 0, newOpCount, newNumbers));
                }
                
                // --- Power (Lv.1) ---
                if (level >= 1) {
                    if (v1 > 0 && v1 <= MAX_POWER_BASE && v2 > 0 && v2 <= MAX_POWER_EXP) {
                         const val = Math.pow(v1, v2);
                         if (Number.isInteger(val)) {
                            addSolution(results, combine(s1, s2, '^', val, 1, newOpCount, newNumbers));
                         }
                    }
                    if (v2 > 0 && v2 <= MAX_POWER_BASE && v1 > 0 && v1 <= MAX_POWER_EXP) {
                         const val = Math.pow(v2, v1);
                         if (Number.isInteger(val)) {
                            addSolution(results, combine(s2, s1, '^', val, 1, newOpCount, newNumbers));
                         }
                    }
                }
                
                // --- Nth Root (Lv.2) ---
                if (level >= 2) {
                    // v2-th root of v1
                    if (v1 > 0 && v2 > 1 && v2 < 10) {
                        const val = Math.pow(v1, 1/v2);
                        if (isCloseToInt(val)) {
                           const intVal = Math.round(val);
                           addSolution(results, combine(s2, s1, 'root', intVal, 2, newOpCount, newNumbers));
                        }
                    }
                    // v1-th root of v2
                    if (v2 > 0 && v1 > 1 && v1 < 10) {
                        const val = Math.pow(v2, 1/v1);
                        if (isCloseToInt(val)) {
                           const intVal = Math.round(val);
                           addSolution(results, combine(s1, s2, 'root', intVal, 2, newOpCount, newNumbers));
                        }
                    }
                }
            }
        }
    }
    
    // --- Unary Ops (sqrt, !) ---
    // ใช้กับผลลัพธ์ที่เพิ่งรวมกัน (เช่น sqrt(4+8))
    const finalResults = new Map(results);
    await applyUnaryOps(finalResults, level, numbers);
    
    allSubsetResults.set(key, finalResults);
    return finalResults;
}

// --- Helper: Apply Unary Ops ---
async function applyUnaryOps(resultsMap, level, numbersUsed) {
    const currentResults = Array.from(resultsMap.values()); // Snapshot
    
    for (const s of currentResults) {
        const v = s.value;
        const opCount = s.opCount + 1;
        
        // Sqrt (Lv.2)
        if (level >= 2 && v > 0 && Number.isInteger(Math.sqrt(v))) {
            const val = Math.sqrt(v);
            const expr = `sqrt(${s.expr})`;
            addSolution(resultsMap, new SolutionInfo(val, expr, 99, opCount, 2, numbersUsed));
        }
        
        // Factorial (Lv.3)
        if (level >= 3 && v >= 0 && v <= MAX_FACTORIAL && Number.isInteger(v)) {
            const val = factorial(v);
            const expr = `(${s.expr})!`;
            addSolution(resultsMap, new SolutionInfo(val, expr, 99, opCount, 3, numbersUsed));
        }
    }
}

// --- Helper: Combine two solutions ---
function combine(s1, s2, op, value, level, opCount, numbers) {
    const prec = PRECEDENCE[op];
    
    // กฎการใส่วงเล็บ (หัวใจของความ "ฉลาด")
    let e1 = (s1.precedence < prec) ? `(${s1.expr})` : s1.expr;
    let e2 = (s2.precedence < prec) ? `(${s2.expr})` : s2.expr;
    
    // จัดการ edge case ของ / และ -
    if (op === '-' && s2.precedence === prec) e2 = `(${s2.expr})`;
    if (op === '/' && s2.precedence === prec) e2 = `(${s2.expr})`;

    let expr;
    if (op === 'root') {
        expr = `(${e1})√(${e2})`; // ใช้ฟอร์แมต (ราก)√(ตัวเลข) เช่น (3)√(8)
    } else {
        expr = `${e1} ${op} ${e2}`;
    }
    
    return new SolutionInfo(value, expr, prec, opCount, Math.max(s1.level, level), numbers);
}

// --- Helper: Add Solution (Smart) ---
// เพิ่มเฉพาะวิธีคิดที่ "ดีกว่า" (ใช้ op น้อยกว่า หรือ level ต่ำกว่า)
function addSolution(map, newSol) {
    if (newSol.value > 9999 || newSol.value < 0) return; // Pruning
    
    const existingSol = map.get(newSol.value);
    
    if (!existingSol) {
        map.set(newSol.value, newSol);
        return;
    }
    
    // เลือกวิธีที่ดีกว่า
    if (newSol.level < existingSol.level) {
        map.set(newSol.value, newSol); // Lv.B ดีกว่า Lv.1
    } else if (newSol.level === existingSol.level && newSol.opCount < existingSol.opCount) {
        map.set(newSol.value, newSol); // op 2 ครั้ง ดีกว่า op 3 ครั้ง
    }
}

// --- Sigma (Σ) Solver ---
// นี่คือฟังก์ชันพิเศษที่พยายามแก้โจทย์ตัวอย่าง
async function solveSigma(numbers, target) {
    const solutions = [];
    // `allSubsetResults` ถูกเติมไว้แล้วจาก `handleSolve`
    
    // 1. หาพาร์ติชัน (S_start, S_end, S_expr)
    const n = numbers.length;
    const indices = Array.from({length: n}, (_, i) => i);
    
    // วนลูปหา 2^n * 2^n -> O(4^n) ... นี่มันช้า!
    // เราต้องใช้แค่พาร์ติชันที่ "disjoint" (ไม่ซ้ำกัน)
    // O(3^n)
    
    // วนลูปหาพาร์ติชัน 3 กลุ่ม (start, end, expr)
    // 0=start, 1=end, 2=expr
    for (let i = 0; i < Math.pow(3, n); i++) {
        const s_start_nums = [];
        const s_end_nums = [];
        const s_expr_nums = [];
        
        let temp = i;
        for (let j = 0; j < n; j++) {
            const group = temp % 3;
            if (group === 0) s_start_nums.push(numbers[j]);
            if (group === 1) s_end_nums.push(numbers[j]);
            if (group === 2) s_expr_nums.push(numbers[j]);
            temp = Math.floor(temp / 3);
        }
        
        // ต้องมีครบทั้ง 3 ส่วน (หรือ start, end และ expr เป็น template)
        if (s_start_nums.length === 0 || s_end_nums.length === 0) continue;
        
        const key_start = s_start_nums.sort((a,b)=>a-b).join(',');
        const key_end = s_end_nums.sort((a,b)=>a-b).join(',');
        
        const starts = allSubsetResults.get(key_start) || new Map();
        const ends = allSubsetResults.get(key_end) || new Map();
        
        // Case 1: S_expr มีตัวเลข (เช่น {2} ใน 2^i - i)
        if (s_expr_nums.length > 0) {
            const key_expr = s_expr_nums.sort((a,b)=>a-b).join(',');
            const exprs = allSubsetResults.get(key_expr) || new Map();
            
            for (const [s_val, s_sol] of starts) {
                for (const [e_val, e_sol] of ends) {
                    if (s_val > e_val || e_val - s_val > MAX_SIGMA_RANGE) continue;
                    
                    for (const [x_val, x_sol] of exprs) {
                        // --- Test Template 1: (X^i - i) ---
                        // นี่คือ Template ที่ตรงกับโจทย์: (2^i - i)
                        let sum = 0;
                        for (let k = s_val; k <= e_val; k++) {
                            sum += (Math.pow(x_val, k) - k);
                        }
                        if (sum === target) {
                           solutions.push(formatSigmaSolution(target, s_sol, e_sol, `(${x_sol.expr})^i - i`));
                        }
                        
                        // --- Test Template 2: (X^i) ---
                        sum = 0;
                        for (let k = s_val; k <= e_val; k++) {
                            sum += Math.pow(x_val, k);
                        }
                        if (sum === target) {
                           solutions.push(formatSigmaSolution(target, s_sol, e_sol, `(${x_sol.expr})^i`));
                        }
                    }
                }
            }
        }
        
        // Case 2: S_expr ว่าง (เช่น i*i, i!)
        if (s_expr_nums.length === 0) {
             for (const [s_val, s_sol] of starts) {
                for (const [e_val, e_sol] of ends) {
                    if (s_val > e_val || e_val - s_val > MAX_SIGMA_RANGE) continue;

                    // --- Test Template: (i*i) ---
                    let sum_sq = 0;
                    for (let k = s_val; k <= e_val; k++) sum_sq += (k*k);
                    if (sum_sq === target) {
                        solutions.push(formatSigmaSolution(target, s_sol, e_sol, `i*i`));
                    }
                    
                    // --- Test Template: (i!) ---
                    if (e_val <= MAX_FACTORIAL) {
                        let sum_fact = 0;
                        for (let k = s_val; k <= e_val; k++) sum_fact += factorial(k);
                        if (sum_fact === target) {
                            solutions.push(formatSigmaSolution(target, s_sol, e_sol, `i!`));
                        }
                    }
                }
            }
        }
    }
    
    return solutions;
}


// --- Display Functions ---
function displaySolutions(solutions, target) {
    if (solutions.length === 0) {
        displayError("ไม่พบวิธีคิดที่เป็นไปได้");
        return;
    }

    // Sort: 1. diff (น้อยสุด) 2. type (sigma) 3. level (น้อยสุด) 4. opCount (น้อยสุด)
    solutions.sort((a, b) => {
        if (a.diff !== b.diff) return a.diff - b.diff;
        if (a.type === 'sigma' && b.type !== 'sigma') return -1; // Sigma มาก่อน
        if (a.type !== 'sigma' && b.type === 'sigma') return 1;
        if (a.level !== b.level) return a.level - b.level;
        return a.opCount - b.opCount;
    });

    const exactMatches = solutions.filter(s => s.diff === 0);
    const closestMatch = solutions[0];

    let html = '';
    
    if (exactMatches.length > 0) {
        html += `<p>✅ พบคำตอบตรงเป๊ะ: <strong>${target}</strong> (แสดง 3 วิธีที่ดีที่สุด)</p>`;
        exactMatches.slice(0, 3).forEach(sol => {
            html += formatSolutionHTML(sol);
        });

    } else {
        html += `<p>❌ ไม่พบคำตอบตรงเป๊ะ</p>`;
        html += `<p>คำตอบที่ใกล้เคียงที่สุดคือ: <strong>${closestMatch.value}</strong> (ต่างจากเป้า ${closestMatch.diff})</p>`;
        html += formatSolutionHTML(closestMatch, true);
    }

    resultsDiv.innerHTML = html;
}

function formatSolutionHTML(sol, isClosest = false) {
    let className = 'result-item';
    if (isClosest) className += ' closest';
    if (sol.type === 'sigma') className += ' sigma';
    
    return `<div class="${className}">
                <strong>${sol.expr}</strong> = ${sol.value}
            </div>`;
}

function formatSigmaSolution(target, s_sol, e_sol, expr_str) {
    // Format: Σ [i=(start_expr) to (end_expr)] (expr)
    const expr = `Σ [i=${s_sol.expr} to ${e_sol.expr}] (${expr_str})`;
    return {
        value: target,
        expr: expr,
        opCount: s_sol.opCount + e_sol.opCount + 99, // Sigma ให้ op เยอะ
        level: 3,
        numbers: [...s_sol.numbers, ...e_sol.numbers],
        diff: 0,
        type: 'sigma'
    };
}

function displayError(message) {
    resultsDiv.innerHTML = `<p class="error-message">${message}</p>`;
}

// --- Math Helpers ---
function factorial(n) {
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }
    return result;
}

function isCloseToInt(n) {
    return Math.abs(n - Math.round(n)) < 1e-9;
}
