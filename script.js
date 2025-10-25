// --- DOM Elements ---
const modeSelect = document.getElementById('mode-select');
const numbersInput = document.getElementById('numbers');
const targetInput = document.getElementById('target');
const levelSelect = document.getElementById('level-select');
const solveButton = document.getElementById('solve-button');
const resultsDiv = document.getElementById('results');
const loadingSpinner = document.getElementById('loading-spinner');

// --- Global Caches & Constants ---
let allSubsetResults = new Map();
const TIME_LIMIT_MS = 5000; // 5 วินาที

// --- Constants ---
const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, 'root': 3 };
const MAX_FACTORIAL = 8;
const MAX_POWER_BASE = 8;
const MAX_POWER_EXP = 5;
const MAX_SIGMA_RANGE = 10;
const MAX_RESULT_VALUE = 20000; 

// --- SolutionInfo Class ---
class SolutionInfo {
    constructor(value, expr, precedence, opCount, level, numbers) {
        this.value = value;
        this.expr = expr;
        this.precedence = precedence; 
        this.opCount = opCount;
        this.level = level; 
        this.numbers = numbers; 
    }
}

// --- Event Listener ---
solveButton.addEventListener('click', handleSolve);

// --- Main Handler ---
function handleSolve() {
    const levelName = levelSelect.value;
    const levelMap = { 'B': 0, '1': 1, '2': 2, '3': 3 };
    const level = levelMap[levelName];
    const target = parseInt(targetInput.value, 10);
    
    const originalNums = numbersInput.value
        .split(/[\s,]+/)
        .filter(n => n !== '')
        .map(n => parseInt(n, 10));

    if (originalNums.some(isNaN) || isNaN(target)) {
        displayError("กรุณาใส่ตัวเลขและเป้าหมายให้ถูกต้อง");
        return;
    }

    const expectedCount = modeSelect.value === '5' ? 5 : 4;
    if (originalNums.length !== expectedCount) {
        displayError(`โหมดนี้ต้องใช้ตัวเลข ${expectedCount} ตัว`);
        return;
    }

    const startTime = Date.now();
    resultsDiv.innerHTML = "";
    loadingSpinner.classList.remove('hidden');
    allSubsetResults.clear(); 
    
    setTimeout(() => {
        let allSolutions = [];

        try {
            solveAllSubsets(originalNums, level);

            const mainKey = [...originalNums].sort((a, b) => a - b).join(',');
            const mainResults = allSubsetResults.get(mainKey) || new Map();
            
            for (const [value, sol] of mainResults.entries()) {
                allSolutions.push({ ...sol, diff: Math.abs(sol.value - target), type: 'normal' });
            }
            
            const timeUsed = Date.now() - startTime;
            const timeRemaining = TIME_LIMIT_MS - timeUsed;
            
            if (level === 3 && timeRemaining > 0) {
                const deadline = Date.now() + timeRemaining;
                const sigmaSolutions = solveSigma(originalNums, target, deadline);
                allSolutions.push(...sigmaSolutions);
            }
            
        } catch (error) {
            console.error("Solver Error:", error);
            displayError("เกิดข้อผิดพลาดระหว่างการคำนวณ");
        }
        
        loadingSpinner.classList.add('hidden');
        displaySolutions(allSolutions, target);
        
    }, 0); 
}

// --- Dynamic Programming Core (Synchronous) ---
function solveAllSubsets(numbers, level) {
    const sortedKey = [...numbers].sort((a, b) => a - b).join(',');
    if (!allSubsetResults.has(sortedKey)) {
        solveSubsetRecursive(numbers, level);
    }
}

function solveSubsetRecursive(numbers, level) {
    const key = [...numbers].sort((a, b) => a - b).join(',');
    if (allSubsetResults.has(key)) {
        return allSubsetResults.get(key);
    }

    const results = new Map();

    // Base Case: [n]
    if (numbers.length === 1) {
        const n = numbers[0];
        addSolution(results, new SolutionInfo(n, `${n}`, 99, 0, 0, [n]));
        applyUnaryOps(results, level, [n]); 
        allSubsetResults.set(key, results);
        return results;
    }

    // Recursive Step: Partition [A, B]
    const n = numbers.length;
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

        const results1 = solveSubsetRecursive(part1, level);
        const results2 = solveSubsetRecursive(part2, level);

        // Combine results
        for (const [v1, s1] of results1.entries()) {
            for (const [v2, s2] of results2.entries()) {
                if (v1 * v2 > MAX_RESULT_VALUE && (v1 > 10 || v2 > 10)) continue;
                
                const newOpCount = s1.opCount + s2.opCount + 1;
                const newNumbers = [...s1.numbers, ...s2.numbers];
                
                // Add (Lv.B)
                addSolution(results, combine(s1, s2, '+', v1 + v2, 0, newOpCount, newNumbers));
                // Subtract (Lv.B)
                if (v1 - v2 >= 0) addSolution(results, combine(s1, s2, '-', v1 - v2, 0, newOpCount, newNumbers));
                if (v2 - v1 >= 0) addSolution(results, combine(s2, s1, '-', v2 - v1, 0, newOpCount, newNumbers));
                // Multiply (Lv.B)
                addSolution(results, combine(s1, s2, '*', v1 * v2, 0, newOpCount, newNumbers));
                // Divide (Lv.B)
                if (v2 !== 0 && v1 % v2 === 0) addSolution(results, combine(s1, s2, '/', v1 / v2, 0, newOpCount, newNumbers));
                if (v1 !== 0 && v2 % v1 === 0) addSolution(results, combine(s2, s1, '/', v2 / v1, 0, newOpCount, newNumbers));
                
                // Power (Lv.1)
                if (level >= 1) {
                    if (v1 > 0 && v1 <= MAX_POWER_BASE && v2 > 0 && v2 <= MAX_POWER_EXP) {
                         const val = Math.pow(v1, v2);
                         if (Number.isInteger(val)) addSolution(results, combine(s1, s2, '^', val, 1, newOpCount, newNumbers));
                    }
                    if (v2 > 0 && v2 <= MAX_POWER_BASE && v1 > 0 && v1 <= MAX_POWER_EXP) {
                         const val = Math.pow(v2, v1);
                         if (Number.isInteger(val)) addSolution(results, combine(s2, s1, '^', val, 1, newOpCount, newNumbers));
                    }
                }
                
                // Nth Root (Lv.2)
                if (level >= 2) {
                    if (s1.numbers.length === 1 && s2.numbers.length === 1) {
                        if (v1 > 0 && v2 > 1 && v2 < 10) { 
                            const val = Math.pow(v1, 1/v2);
                            if (isCloseToInt(val)) addSolution(results, combine(s2, s1, 'root', Math.round(val), 2, newOpCount, newNumbers));
                        }
                        if (v2 > 0 && v1 > 1 && v1 < 10) { 
                            const val = Math.pow(v2, 1/v1);
                            if (isCloseToInt(val)) addSolution(results, combine(s1, s2, 'root', Math.round(val), 2, newOpCount, newNumbers));
                        }
                    }
                }
            }
        }
    }
    
    // Unary Ops (sqrt, !) on combined results
    const finalResults = new Map(results);
    applyUnaryOps(finalResults, level, numbers);
    
    allSubsetResults.set(key, finalResults);
    return finalResults;
}

// --- Helper: Apply Unary Ops (Synchronous) ---
function applyUnaryOps(resultsMap, level, numbersUsed) {
    const currentResults = Array.from(resultsMap.values()); 
    
    for (const s of currentResults) {
        const v = s.value;
        const opCount = s.opCount + 1;
        
        // Sqrt (Lv.2) - ใช้สัญลักษณ์ √(...)
        if (level >= 2 && v > 0 && Number.isInteger(Math.sqrt(v))) {
            const val = Math.sqrt(v);
            const expr = `√(${s.expr})`;
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

// --- Helper: Combine two solutions (Synchronous) ---
function combine(s1, s2, op, value, level, opCount, numbers) {
    const prec = PRECEDENCE[op];
    
    let e1 = (s1.precedence < prec) ? `(${s1.expr})` : s1.expr;
    let e2 = (s2.precedence < prec) ? `(${s2.expr})` : s2.expr;
    
    // สำหรับ +,-,*: ให้วงเล็บตาม precedence
    if (op === '-') e2 = (s2.precedence <= prec) ? `(${s2.expr})` : s2.expr;
    
    // Note: สำหรับ / ยังคงใช้ / ในการเก็บค่า expr และจะจัดการวงเล็บในการแสดงผล HTML

    let expr;
    if (op === 'root') {
        expr = `(${e2})√(${e1})`; 
    } else if (op === '^') {
        expr = `{${e1}}^{${e2}}`; 
    } else {
        expr = `${e1} ${op} ${e2}`;
    }
    
    return new SolutionInfo(value, expr, prec, opCount, Math.max(s1.level, level), numbers);
}

// --- Helper: Add Solution (Smart/Heuristic) ---
function addSolution(map, newSol) {
    if (newSol.value > MAX_RESULT_VALUE || newSol.value < 0) return; 
    
    const existingSol = map.get(newSol.value);
    
    if (!existingSol) {
        map.set(newSol.value, newSol);
        return;
    }
    
    if (newSol.level < existingSol.level) {
        map.set(newSol.value, newSol);
    } else if (newSol.level === existingSol.level && newSol.opCount < existingSol.opCount) {
        map.set(newSol.value, newSol);
    } else if (newSol.level === existingSol.level && 
               newSol.opCount === existingSol.opCount &&
               newSol.expr.length < existingSol.expr.length) {
        map.set(newSol.value, newSol); 
    }
}

// --- Sigma (Σ) Solver (with Timeout) ---
function solveSigma(numbers, target, deadline) {
    const solutions = [];
    const n = numbers.length;
    
    for (let i = 0; i < Math.pow(3, n); i++) {
        if (i % 100 === 0 && Date.now() > deadline) {
            console.warn("Sigma search timed out.");
            break; 
        }

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
        
        if (s_start_nums.length === 0 || s_end_nums.length === 0) continue;
        
        const key_start = [...s_start_nums].sort((a, b) => a - b).join(',');
        const key_end = [...s_end_nums].sort((a, b) => a - b).join(',');
        
        const starts = allSubsetResults.get(key_start) || new Map();
        const ends = allSubsetResults.get(key_end) || new Map();
        
        // Case 1: S_expr (ตัวเลขในสูตร)
        if (s_expr_nums.length > 0) {
            const key_expr = [...s_expr_nums].sort((a, b) => a - b).join(',');
            const exprs = allSubsetResults.get(key_expr) || new Map();
            
            for (const [s_val, s_sol] of starts.entries()) {
                for (const [e_val, e_sol] of ends.entries()) {
                    if (s_val <= 0 || s_val > e_val || e_val - s_val > MAX_SIGMA_RANGE) continue;
                    
                    for (const [x_val, x_sol] of exprs.entries()) {
                        let sum = 0;
                        for (let k = s_val; k <= e_val; k++) sum += (Math.pow(x_val, k) - k);
                        
                        if (sum === target) {
                             const expr_base = `{${x_sol.expr}}^{i}`;
                             const full_expr = `(${expr_base} - i)`; 
                             
                             solutions.push(formatSigmaSolution(target, s_sol, e_sol, full_expr));
                        }
                    }
                }
            }
        }
        
        // Case 2: S_expr ว่าง (เช่น i^2, i!, i!+i)
        if (s_expr_nums.length === 0) {
             for (const [s_val, s_sol] of starts.entries()) {
                for (const [e_val, e_sol] of ends.entries()) {
                    if (s_val <= 0 || s_val > e_val || e_val - s_val > MAX_SIGMA_RANGE) continue;

                    let sum_sq = 0;
                    for (let k = s_val; k <= e_val; k++) sum_sq += (k*k);
                    if (sum_sq === target) solutions.push(formatSigmaSolution(target, s_sol, e_sol, `i^{2}`)); 
                    
                    if (e_val <= MAX_FACTORIAL) {
                        let sum_fact = 0;
                        for (let k = s_val; k <= e_val; k++) sum_fact += factorial(k);
                        if (sum_fact === target) solutions.push(formatSigmaSolution(target, s_sol, e_sol, `i!`));
                    }
                    
                    if (e_val <= MAX_FACTORIAL) {
                        let sum_fact_plus_i = 0;
                        for (let k = s_val; k <= e_val; k++) sum_fact_plus_i += (factorial(k) + k);
                        if (sum_fact_plus_i === target) solutions.push(formatSigmaSolution(target, s_sol, e_sol, `i! + i`));
                    }
                    
                    if (e_val <= MAX_FACTORIAL) {
                        let sum_i_plus_fact = 0;
                        for (let k = s_val; k <= e_val; k++) sum_i_plus_fact += (k + factorial(k));
                        if (sum_i_plus_fact === target) solutions.push(formatSigmaSolution(target, s_sol, e_sol, `i + i!`));
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
        displayError("ไม่พบวิธีคิด (หรือหาไม่ทันใน 5 วินาที)");
        return;
    }

    solutions.sort((a, b) => {
        if (a.diff !== b.diff) return a.diff - b.diff;
        if (a.type !== 'sigma' && b.type === 'sigma') return -1; 
        if (a.type === 'sigma' && b.type !== 'sigma') return 1;
        if (a.level !== b.level) return a.level - b.level;
        return a.opCount - b.opCount;
    });

    const exactMatches = solutions.filter(s => s.diff === 0);
    const closestMatch = solutions[0];

    let html = '';
    
    if (exactMatches.length > 0) {
        html += `<p>✅ พบคำตอบตรงเป๊ะ: <strong>${target}</strong> (แสดง 3 วิธีที่ง่ายที่สุด)</p>`;
        exactMatches.slice(0, 3).forEach(sol => {
            html += formatSolutionHTML(sol);
        });

    } else {
        html += `<p>❌ ไม่พบคำตอบตรงเป๊ะ (ใน 5 วินาที)</p>`;
        html += `<p>คำตอบที่ใกล้เคียงที่สุดที่หาได้คือ: <strong>${closestMatch.value}</strong> (ต่างจากเป้า ${closestMatch.diff})</p>`;
        html += formatSolutionHTML(closestMatch, true);
    }

    resultsDiv.innerHTML = html;
    
    if (window.MathJax) {
        MathJax.typesetPromise([resultsDiv]).catch(function (err) {
            console.error('MathJax Typeset failed:', err);
        });
    }
}

// *** ฟังก์ชันช่วยล้างวงเล็บครอบนอกสุดที่ไม่จำเป็น ***
function cleanParentheses(s) {
    s = s.trim();
    if (!s.startsWith('(') || !s.endsWith(')')) return s;

    let balance = 0;
    let isFullyCovered = true;
    for (let i = 1; i < s.length - 1; i++) {
        if (s[i] === '(') balance++;
        if (s[i] === ')') balance--;
        if (balance < 0) {
            isFullyCovered = false;
            break;
        }
    }

    // ถ้าครอบคลุมทั้งหมดและวงเล็บสมดุล (balance = 0)
    if (isFullyCovered && balance === 0) {
        return cleanParentheses(s.substring(1, s.length - 1)); // เรียกซ้ำเพื่อล้างวงเล็บซ้อน
    }
    
    return s;
}

// *** ฟังก์ชันหลักที่แปลง Expression เป็น LaTeX (เน้นการจัดการเศษส่วน) ***
function formatSolutionHTML(sol, isClosest = false) {
    let className = 'result-item';
    if (isClosest) className += ' closest';
    if (sol.type === 'sigma') className += ' sigma';

    let displayExpr = sol.expr;
    
    // 1. แปลงสัญลักษณ์รากที่สอง/N
    displayExpr = displayExpr.replace(/√\((.*?)\)/g, '\\sqrt{$1}');
    displayExpr = displayExpr.replace(/\((\d+)\)√\((.*?)\)/g, '\\sqrt[$1]{$2}');
    
    // 2. แปลงเครื่องหมายหาร (/) เป็น เศษส่วน (\frac{A}{B})
    if (sol.type !== 'sigma') {
        
        // ใช้การแยกส่วนที่ฉลาดขึ้น: แยกด้วย +, - นอกสุดก่อน เพื่อให้การหารถูกแปลงภายในกลุ่มการคูณ/หารเท่านั้น
        let tokens = displayExpr.split(/([+\-])/g);
        let finalExpr = '';
        
        for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i].trim();
            if (token === '+' || token === '-' || token === '') {
                finalExpr += tokens[i];
                continue;
            }

            // ในแต่ละ token ที่เป็นนิพจน์ (เช่น A*B/C)
            // เราจะแปลงหาร (/) เป็น \frac{A}{B} โดยต้องทำงานจากขวาไปซ้าย
            // ตัวอย่าง: A / B / C ต้องเป็น \frac{A}{\frac{B}{C}}
            
            let tempExpr = token;
            
            // วนลูปเพื่อจัดการการหาร
            while (tempExpr.includes('/')) {
                // Regex เพื่อค้นหา: A / B
                // A คือนิพจน์ก่อนหน้า / ที่ไม่มี + หรือ - นอกสุด
                // B คือนิพจน์ที่เหลือหลังจาก /
                
                // เราใช้เทคนิคการแยกการหารสุดท้าย (ขวาไปซ้าย) เพื่อจัดการลำดับ
                const lastDivIndex = tempExpr.lastIndexOf('/');
                if (lastDivIndex === -1) break;

                const numeratorPart = tempExpr.substring(0, lastDivIndex).trim();
                const denominatorPart = tempExpr.substring(lastDivIndex + 1).trim();

                // **ค้นหาขอบเขตของตัวเศษ A:**
                // A มักจะเป็นนิพจน์ที่อยู่ด้านซ้ายสุดก่อน /
                // ตัวอย่าง: (A+B)*C / D -> A = (A+B)*C
                // ตัวอย่าง: A * B / C -> A = A*B
                
                let numerator = numeratorPart;
                let denominator = denominatorPart;

                // **กรณี A/B ซ้อนอยู่ภายในนิพจน์ที่ยาวขึ้น**
                
                // 1. ตัวส่วน (Denominator): B คือนิพจน์ที่อยู่หลัง / ไปจนจบ Token
                // ตัวอย่าง: A / (B + C) * D -> ตัวส่วนคือ (B + C)
                // เราใช้ cleanParentheses เพื่อเอาวงเล็บครอบที่ไม่จำเป็นออก
                denominator = cleanParentheses(denominator);

                // 2. ตัวเศษ (Numerator): A คือนิพจน์ที่อยู่หน้า /
                // ตัวอย่าง: (6!) / (3+3+3) -> A = (6!)
                
                // เราต้องหาขอบเขตของ A ที่ถูกต้องใน numeratorPart
                
                let lastOpIndex = -1;
                let balance = 0;
                // ไล่จากขวาไปซ้ายใน numeratorPart เพื่อหาวงเล็บหรือตัวดำเนินการ +,- ที่จะหยุด A
                for (let k = numeratorPart.length - 1; k >= 0; k--) {
                    const char = numeratorPart[k];
                    if (char === ')') balance++;
                    if (char === '(') balance--;

                    // หยุดเมื่อเจอตัวดำเนินการที่มี precedence ต่ำกว่าการหาร (คือ +, -) นอกวงเล็บ
                    if (balance === 0 && (char === '+' || char === '-')) {
                        lastOpIndex = k;
                        break;
                    }
                }

                // A คือส่วนหลังจาก lastOpIndex
                if (lastOpIndex !== -1) {
                    numerator = cleanParentheses(numeratorPart.substring(lastOpIndex + 1).trim());
                    const remainingPart = numeratorPart.substring(0, lastOpIndex + 1).trim();
                    tempExpr = `${remainingPart} \\frac{${numerator}}{${denominator}}`;
                } else {
                    numerator = cleanParentheses(numeratorPart);
                    tempExpr = `\\frac{${numerator}}{${denominator}}`;
                }
                
                // ถ้าการแทนที่ทำให้นิพจน์ทั้งหมดเปลี่ยนเป็นเศษส่วนแล้ว ให้หยุด
                if (tempExpr.startsWith('\\frac{')) break;
                
            }
            
            finalExpr += tempExpr;
        }

        displayExpr = finalExpr;
    }

    // 3. แปลง Root และครอบด้วย $$ 
    if (sol.type !== 'sigma') {
        displayExpr = `$$${displayExpr}$$`; 
    }
    
    return `<div class="${className}">
                <strong>${displayExpr}</strong> = ${sol.value}
            </div>`;
}

// *** สร้าง String LaTeX สำหรับ Sigma (เพิ่มวงเล็บครอบสูตร) ***
function formatSigmaSolution(target, s_sol, e_sol, expr_str) {
    // แปลง / ในสูตร Sigma เป็น \frac
    expr_str = expr_str.replace(/(\S+)\s*\/\s*(\S+)/g, (match, p1, p2) => {
        // ล้างวงเล็บที่ไม่จำเป็นออก
        let n = cleanParentheses(p1);
        let d = cleanParentheses(p2);
        return `\\frac{${n}}{${d}}`;
    });
    
    const expr = `$$\\sum_{i = {${s_sol.expr}}}^{{${e_sol.expr}}} (${expr_str})$$`;
    
    return {
        value: target,
        expr: expr,
        opCount: s_sol.opCount + e_sol.opCount + 99, 
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
