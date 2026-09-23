const fs = require('fs');
const p = 'c:/Users/USER/Desktop/providers web/joyful-journal/src/routes/admin.dashboard.tsx';
let c = fs.readFileSync(p, 'utf8');

// 1. Change Disputes navItem from 2-tuple to 3-tuple with href
c = c.replace(
  '[AlertTriangle, "Disputes"]',
  '[AlertTriangle, "Disputes", "/admin/disputes"]'
);

// 2. Add index 8 (Wallet) and index 11 (Disputes) and index 12 (Reviews) branches
const oldBranch = ': index === 7 ? <a key={name} href="/admin/finance" onClick={() => setMobileOpen(false)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"><Icon className="h-3.5 w-3.5" />{name}</a> : <button key={name} disabled className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400"><Icon className="h-3.5 w-3.5" />{name}<span className="ml-auto text-[9px] uppercase">Soon</span></button>';
const newBranch = ': index === 7 ? <a key={name} href="/admin/finance" onClick={() => setMobileOpen(false)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"><Icon className="h-3.5 w-3.5" />{name}</a> : index === 8 ? <a key={name} href="/admin/wallet" onClick={() => setMobileOpen(false)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"><Icon className="h-3.5 w-3.5" />{name}</a> : index === 11 ? <a key={name} href="/admin/disputes" onClick={() => setMobileOpen(false)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50"><Icon className="h-3.5 w-3.5" />{name}</a> : index === 12 ? <a key={name} href="/admin/reviews" onClick={() => setMobileOpen(false)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700"><Icon className="h-3.5 w-3.5" />{name}</a> : <button key={name} disabled className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-slate-400"><Icon className="h-3.5 w-3.5" />{name}<span className="ml-auto text-[9px] uppercase">Soon</span></button>';

if (c.includes(oldBranch)) {
  c = c.replace(oldBranch, newBranch);
  fs.writeFileSync(p, c, 'utf8');
  console.log('dashboard updated');
} else {
  console.log('oldBranch not found - attempting partial match');
  // Try to find what the actual text looks like
  const idx = c.indexOf('index === 7');
  console.log('index 7 context:', JSON.stringify(c.substring(idx - 50, idx + 400)));
}
