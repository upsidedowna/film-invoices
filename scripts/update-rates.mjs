#!/usr/bin/env node
// Bi-annual rate card updater — called by GitHub Actions every Feb 1 and Aug 1.
// Updates role rates AND project type rates. Never touches names or structure.

import { readFileSync, writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const RATE_CARD_PATH = new URL('../rate-card.json', import.meta.url).pathname;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  const rateCard = JSON.parse(readFileSync(RATE_CARD_PATH, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);

  console.log('Researching current Atlanta / Southeast US production rates...');

  const currentRoles = rateCard.departments.flatMap(dept =>
    dept.roles.map(r => `${dept.label} > ${r.name}: typical $${r.typical}, low $${r.low}, high $${r.high}`)
  ).join('\n');

  const currentProjectTypes = (rateCard.projectTypes || [])
    .map(p => `${p.name}: typicalDP $${p.typicalDP}, range "${p.range}"`)
    .join('\n');

  const prompt = [
    'You are researching current 2025-2026 day rates for film and video production freelancers',
    'in the Atlanta / Southeast US market.',
    '',
    'Current role rates:',
    currentRoles,
    '',
    'Current project type DP rates:',
    currentProjectTypes,
    '',
    'Search the web for current Atlanta / SE US production day rates. Look for:',
    '- Production rate surveys (ProductionHub, StaffMeUp, Mandy.com)',
    '- Union/guild reference rates (IATSE, SAG-AFTRA minimums)',
    '- Crew rate discussions on forums and industry sites',
    '- Published rate cards from Atlanta production companies',
    '',
    'Return a JSON object with two arrays. Only include entries that need updating:',
    '',
    '{',
    '  "roles": [',
    '    { "dept": "Camera", "role": "Director of Photography", "typical": 1600, "low": 800, "high": 4800, "reason": "one-sentence reason" }',
    '  ],',
    '  "projectTypes": [',
    '    { "name": "Commercial (agency/brand)", "typicalDP": 2800, "range": "$1,800-$5,500 w/ kit", "reason": "one-sentence reason" }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Only change values with clear market evidence',
    '- Keep changes conservative — no more than 15-20% swing unless strong evidence',
    '- If nothing needs updating, return { "roles": [], "projectTypes": [] }',
    '- Do NOT change role names, project type names, slugs, or department names',
    '- Numbers only in numeric fields (no $ signs)',
  ].join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) {
    console.log('No text response from Claude — skipping update.');
    return;
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log('No JSON found in response — skipping update.');
    console.log('Response preview:', textBlock.text.slice(0, 500));
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Failed to parse JSON:', e.message);
    return;
  }

  const roleUpdates = Array.isArray(parsed.roles) ? parsed.roles : [];
  const ptUpdates = Array.isArray(parsed.projectTypes) ? parsed.projectTypes : [];

  if (roleUpdates.length === 0 && ptUpdates.length === 0) {
    console.log('No updates needed — rates confirmed current.');
    updateNote(rateCard, today, [], [], 'No changes — rates confirmed current.');
    writeFileSync(RATE_CARD_PATH, JSON.stringify(rateCard, null, 2));
    return;
  }

  const appliedRoles = [];
  const appliedPT = [];

  // Apply role updates — only touches typical/low/high, never name or notes
  for (const u of roleUpdates) {
    for (const dept of rateCard.departments) {
      if (dept.label !== u.dept) continue;
      const role = dept.roles.find(r => r.name === u.role);
      if (!role) continue;
      const before = { typical: role.typical, low: role.low, high: role.high };
      if (u.typical) role.typical = u.typical;
      if (u.low) role.low = u.low;
      if (u.high) role.high = u.high;
      appliedRoles.push({ label: `${dept.label} > ${role.name}`, before, after: { typical: role.typical, low: role.low, high: role.high }, reason: u.reason });
      console.log(`  role: ${dept.label} > ${role.name}  $${before.typical} -> $${role.typical}`);
    }
  }

  // Apply project type updates — only touches typicalDP/range, never name
  for (const u of ptUpdates) {
    const pt = (rateCard.projectTypes || []).find(p => p.name === u.name);
    if (!pt) continue;
    const before = { typicalDP: pt.typicalDP, range: pt.range };
    if (u.typicalDP) pt.typicalDP = u.typicalDP;
    if (u.range) pt.range = u.range;
    appliedPT.push({ name: pt.name, before, after: { typicalDP: pt.typicalDP, range: pt.range }, reason: u.reason });
    console.log(`  project type: "${pt.name}"  $${before.typicalDP} -> $${pt.typicalDP}`);
  }

  updateNote(rateCard, today, appliedRoles, appliedPT);
  writeFileSync(RATE_CARD_PATH, JSON.stringify(rateCard, null, 2));
  console.log(`Done. ${appliedRoles.length} role(s) + ${appliedPT.length} project type(s) updated.`);
}

function updateNote(rateCard, date, roles, projectTypes, summary) {
  const parts = [];
  if (roles.length > 0) parts.push(roles.map(r => `${r.label}: $${r.before.typical}->${r.after.typical}`).join('; '));
  if (projectTypes.length > 0) parts.push(projectTypes.map(p => `${p.name}: $${p.before.typicalDP}->${p.after.typicalDP}`).join('; '));
  rateCard._note = `Last reviewed: ${date}. ${parts.length ? parts.join(' | ') : (summary || 'No changes')}. Rates reflect Southeast US (Atlanta) market.`;
  rateCard._lastReviewed = date;
}

main().catch(err => {
  console.error('Rate update failed:', err.message);
  process.exit(1);
});
