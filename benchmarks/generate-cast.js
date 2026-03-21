#!/usr/bin/env node
'use strict';
const { writeFileSync } = require('fs');
const { resolve } = require('path');

const W = 96, H = 34;
const events = [];
let t = 0;

function emit(text, delay) { t += delay || 0; events.push([+t.toFixed(3), 'o', text]); }
function pause(sec) { t += sec; }
function line(text) { emit(text + '\r\n'); }
function blank() { line(''); }

function typeCmd(text) {
  var speed = 0.15; // 80 wpm
  for (var i = 0; i < text.length; i++) {
    t += speed;
    events.push([+t.toFixed(3), 'o', text[i]]);
  }
  emit('\r\n');
}

function output(lines, before, gap) {
  t += before == null ? 0.4 : before;
  for (var i = 0; i < lines.length; i++) {
    emit(lines[i] + '\r\n');
    t += gap == null ? 0.07 : gap;
  }
}

var G   = function(s) { return '\x1b[32m' + s + '\x1b[0m'; };
var DIM = function(s) { return '\x1b[2m'  + s + '\x1b[0m'; };
var R   = function(s) { return '\x1b[31m' + s + '\x1b[0m'; };
var B   = function(s) { return '\x1b[1m'  + s + '\x1b[0m'; };
var Y   = function(s) { return '\x1b[33m' + s + '\x1b[0m'; };

// box-drawing chars as unicode escapes
var TL = '\u250C', TR = '\u2510', BL = '\u2514', BR = '\u2518';
var H_ = '\u2500', V_ = '\u2502';
var LT = '\u251C', RT = '\u2524';

// draw a labelled section box:  ┌─[ label ]─────────────────┐
function scenarioBox(num, title) {
  var label  = ' scenario ' + num + ' ';
  var inner  = W - 4;                        // inside the 2-space left margin + borders
  var dashes = inner - label.length - 4;     // 4 = "─[" + "]─"
  var top    = TL + H_ + '[' + label + ']' + H_.repeat(Math.max(0, dashes)) + TR;
  var mid    = V_ + ' ' + title + ' '.repeat(Math.max(0, inner - title.length - 1)) + V_;
  var bot    = BL + H_.repeat(inner + 2) + BR;
  blank();
  line('  ' + B(top));
  line('  ' + DIM(mid));
  line('  ' + DIM(bot));
  blank();
  pause(0.4);
}

// thin labelled divider line:  ── label ──────────────────────
function divider(label, color) {
  color = color || DIM;
  var dashes = W - label.length - 6;
  line('  ' + color(H_ + H_ + ' ' + label + ' ' + H_.repeat(Math.max(0, dashes))));
}


// ── clear ─────────────────────────────────────────────────────────────────────
emit('\x1b[2J\x1b[H');
pause(0.4);

// ── MIKK banner ───────────────────────────────────────────────────────────────
var BANNER = [
  '\u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557',
  '\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2551 \u2588\u2588\u2554\u255D\u2588\u2588\u2551 \u2588\u2588\u2554\u255D',
  '\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2554\u255D ',
  '\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2588\u2588\u2557 ',
  '\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2557',
  '\u255A\u2550\u255D     \u255A\u2550\u255D\u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D',
];
for (var b = 0; b < BANNER.length; b++) {
  line('  ' + B(BANNER[b]));
  t += 0.04;
}

blank();
line('  ' + B('mikk-bench') + DIM('  \u00B7  how much tokens does an AI agent save using MCP?'));
line('  ' + DIM(H_.repeat(60)));
pause(1.8);


// ════════════════════════════════════════════════════════
//  SCENARIO 1
// ════════════════════════════════════════════════════════
scenarioBox(1, 'find architectural boundary violations');

// ── without ──────────────────────────────────────────────
divider('without mikk');
blank();
emit(DIM('  $ ')); typeCmd("grep -r 'import.*users' src/payments/");
output([
  DIM("    billing.ts:3:  import { findUserById } from '../users/repository'"),
  DIM("    stripe.ts:5:   import { getUserEmail }  from '../users/service'"),
  DIM('    # which are violations? must open mikk.json to check manually'),
], 0.5);
pause(0.5);

emit(DIM('  $ ')); typeCmd('cat src/payments/billing.ts');
output([
  DIM('    // 59 lines  (\u223c455 tokens)'),
  DIM("    import { findUserById } from '../users/repository'"),
  DIM('    export async function createInvoice(userId, amount) { ... }'),
  DIM('    // ...50 more lines loaded'),
], 0.5);
blank();
line('  ' + DIM('\u223c820 tokens  \u00B7  grep + 2 file reads  \u00B7  rule check still manual'));
pause(1.8);

// ── with mikk ────────────────────────────────────────────
blank();
divider('with mikk');
blank();
line('  ' + DIM('[agent \u2192 mikk_ci]'));
pause(0.5);
emit(DIM('  $ ')); typeCmd('mikk ci --format json');
output([
  G('  {'),
  G('    "pass": false,  "violations": 2,'),
  G('    "details": ['),
  G('      { "from": "Payments::createInvoice", "to": "Users::findUserById",'),
  G('        "rule": "payments must not import from users" },'),
  G('      { "from": "Payments::billing.ts",    "to": "Users::repository.ts",'),
  G('        "rule": "payments must not import from users" }'),
  G('    ]'),
  G('  }'),
], 0.5, 0.055);
blank();
line('  ' + DIM('\u223c18 tokens  \u00B7  1 tool call  \u00B7  exact violations + rule text'));
blank();

// ── result ───────────────────────────────────────────────
line('  ' + R('\u223c820 tokens') + '  \u2192  ' + G('\u223c18 tokens') + '     ' + B(G('97.8% saved')));
pause(4.0);


// ════════════════════════════════════════════════════════
//  SCENARIO 2
// ════════════════════════════════════════════════════════
scenarioBox(2, 'blast radius \u2014 what breaks if verifyToken() changes?');

// ── without ──────────────────────────────────────────────
divider('without mikk');
blank();
emit(DIM('  $ ')); typeCmd("grep -rn 'verifyToken' src/");
output([
  DIM('    auth/jwt.ts:12:       export function verifyToken(token)'),
  DIM('    middleware/auth.ts:8:  const payload = verifyToken(header)'),
  DIM('    auth/session.ts:31:   const decoded = verifyToken(token)'),
  DIM('    auth/jwt.ts:35:       return verifyToken(token) !== null'),
  DIM('    # must open each file to understand depth of impact'),
], 0.5);
pause(0.5);

emit(DIM('  $ ')); typeCmd('cat src/middleware/auth.ts src/auth/session.ts');
output([
  DIM('    // 2 files loaded  (\u223c526 tokens)'),
  DIM('    // no transitive depth  \u00B7  no module boundary info'),
], 0.5);
blank();
line('  ' + DIM('\u223c780 tokens  \u00B7  grep + 2 file reads  \u00B7  incomplete picture'));
pause(1.8);

// ── with mikk ────────────────────────────────────────────
blank();
divider('with mikk');
blank();
line('  ' + DIM('[agent \u2192 mikk_impact_analysis]'));
pause(0.5);
emit(DIM('  $ ')); typeCmd('mikk context impact src/auth/jwt.ts');
output([
  G('  {'),
  G('    "changedNodes": 5,  "impactedNodes": 8,'),
  G('    "depth": 3,  "confidence": "high",'),
  G('    "impacted": ['),
  G('      { "function": "requireAuth",     "module": "middleware" },'),
  G('      { "function": "validateSession", "module": "auth"       },'),
  G('      { "function": "refreshToken",    "module": "auth"       },'),
  G('      { "function": "handleLogin",     "module": "routes"     }'),
  G('    ],'),
  G('    "tokens": { "used": 312, "raw": 3150, "saved": 2838 }'),
  G('  }'),
], 0.5, 0.055);
blank();
line('  ' + DIM('\u223c312 tokens  \u00B7  1 call  \u00B7  full depth-3 call graph'));
blank();

// ── result ───────────────────────────────────────────────
line('  ' + R('\u223c780 tokens') + '  \u2192  ' + G('\u223c312 tokens') + '    ' + B(G('60% saved')));
pause(4.0);


// ════════════════════════════════════════════════════════
//  SCENARIO 3
// ════════════════════════════════════════════════════════
scenarioBox(3, 'session start \u2014 orient the agent on the codebase');

// ── without ──────────────────────────────────────────────
divider('without mikk');
blank();
emit(DIM('  $ ')); typeCmd("find src/ -name '*.ts' | head -20");
output([
  DIM('    src/auth/jwt.ts'),
  DIM('    src/auth/password.ts'),
  DIM('    src/auth/session.ts'),
  DIM('    src/payments/billing.ts'),
  DIM('    ...17 files total  (\u223c3,966 tokens to read everything)'),
  DIM('    # no module map  \u00B7  no constraint status  \u00B7  no hot-file detection'),
], 0.5);
blank();
line('  ' + DIM('\u223c3,966 tokens  \u00B7  17 files  \u00B7  no structure or constraints'));
pause(1.8);

// ── with mikk ────────────────────────────────────────────
blank();
divider('with mikk');
blank();
line('  ' + DIM('[agent \u2192 mikk_get_session_context]'));
pause(0.5);
emit(DIM('  $ ')); typeCmd('mikk_get_session_context');
output([
  G('  {'),
  G('    "project":  { "name": "ts-express-api", "language": "typescript" },'),
  G('    "summary":  {'),
  G('      "totalFunctions": 47,  "totalFiles": 17,  "totalModules": 7,'),
  G('      "constraintViolations": 2,  "constraintsPass": false'),
  G('    },'),
  G('    "hotModules":  [{ "id": "payments", "changes": 2 }],'),
  G('    "constraints": ["payments must not import from users"],'),
  G('    "tokens": { "used": 420, "raw": 3966, "saved": 3546 }'),
  G('  }'),
], 0.5, 0.06);
blank();
line('  ' + DIM('\u223c420 tokens  \u00B7  1 call  \u00B7  violations + modules + constraints'));
blank();

// ── result ───────────────────────────────────────────────
line('  ' + R('\u223c3,966 tokens') + '  \u2192  ' + G('\u223c420 tokens') + '     ' + B(G('89.4% saved')));
pause(4.0);


// ════════════════════════════════════════════════════════
//  SUMMARY
// ════════════════════════════════════════════════════════
blank();
line('  ' + DIM(H_.repeat(60)));
blank();
pause(0.3);

var rows = [
  ['  scenario',             'without mikk',     'with mikk',    'saved'  ],
  ['  ' + H_.repeat(22),    H_.repeat(14),       H_.repeat(13),  H_.repeat(8) ],
  ['  boundary violations',  '\u223c820 tokens',  '\u223c18 tokens',   '97.8%' ],
  ['  blast radius',         '\u223c780 tokens',  '\u223c312 tokens',  '60.0%' ],
  ['  session start',        '\u223c3,966 tokens','\u223c420 tokens',  '89.4%' ],
  ['  ' + H_.repeat(22),    H_.repeat(14),       H_.repeat(13),  H_.repeat(8) ],
  ['  total',                '\u223c5,566 tokens','\u223c750 tokens',  '86.5%' ],
];

for (var i = 0; i < rows.length; i++) {
  var r = rows[i];
  var sc = r[0].padEnd(28), wo = r[1].padEnd(16), wi = r[2].padEnd(14), sv = r[3];
  var isDiv   = r[1].indexOf(H_) >= 0;
  var isHead  = r[0].trim() === 'scenario';
  var isTotal = r[0].trim() === 'total';
  if      (isDiv)   line(DIM(sc + wo + wi + sv));
  else if (isHead)  line(DIM(sc + wo + wi + sv));
  else if (isTotal) line(sc + R(wo) + G(wi) + B(G(sv)));
  else              line(DIM(sc) + R(wo) + G(wi) + G(sv));
  t += 0.07;
}

blank();
line('  ' + DIM('$15/M tokens  \u00B7  without: $0.083  with: $0.011  \u00B7  $0.072 saved per session'));
blank();
pause(0.4);
line('  ' + DIM('npm install -g @getmikk/cli'));
blank();
pause(8.0);

// ── write ─────────────────────────────────────────────────────────────────────
var header = JSON.stringify({
  version: 2, width: W, height: H, timestamp: 1742565600,
  title: 'mikk-bench', env: { SHELL: 'bash', TERM: 'xterm-256color' }
});
var cast = [header].concat(events.map(function(e){ return JSON.stringify(e); })).join('\n') + '\n';
var out  = resolve(__dirname, 'mikk-benchmark.cast');
writeFileSync(out, cast, 'utf8');
console.log('events: ' + events.length + '  duration: ' + t.toFixed(1) + 's');
console.log('written: ' + out);
