#!/usr/bin/env node
// Bi-annual rate card updater — called by GitHub Actions every 6 months.
// Reads rate-card.json, asks Claude to research current SE US market rates,
// writes back only the numeric rate fields, commits, and deploys to Vercel.

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

const RATE_CARD_PATH = new URL('../rate-card.json', import.meta.url).pathname;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  const rateCard = JSON.parse(readFileSync(RATE_CARD_PATH, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);

  console.log('Researching current Atlanta / Southeast US production rates...');

  const currentRoles = rateCard.departments.flatMap(dept =>
    dept.roles.map(r => `${dept.label} › ${r.name}: typical $${r.typical}, low $${r.low}, high $${r.high}`)
  ).join('\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{
      role: 'user',
      content: `You are researching current 2025–2026 day rates for film and video production freelancers in the Atlanta / Southeast US market.

Current rates in our system:
${currentRoles}

Search the web for current Atlanta / SE US production day rates. Look for:
- Production rate surveys (ProductionHub, StaffMeUp, Mandy.com)
- Union/guild reference rates (IATSE, SAG-AFTRA minimums)
- Crew rate discussions on forums and industry sites
- Any published rate cards from Atlanta production companies

After researching, return ONLY a JSON array of updates for roles where the market data suggests the current rates are off. Use this exact format — do not include roles that don't need updating:

[
  {
    "dept": "Camera",
    "role": "Director of Photography",
    "typical": 1600,
    "low": 800,
    "high": 4800,
    "reason": "one-sentence reason"
  }
]

Rules:
- Only change values that have clear market evidence
- Keep changes conservative — don't swing more than 15–20% unless there's strong evidence
- If rates look accurate, return an empty array: []
- Do NOT change role names, slugs, or department names
- Numbers only (no $ signs, no ranges in the fields)`
    }]
  });

  // Extract the final text response (after any web search tool use)
  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) {
    console.log('No text response from Claude — skipping update.');
    return;
  }

  // Parse the JSON array from the response
  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log('No JSON array found in response — skipping update.');
    console.log('Response:', textBlock.text.slice(0, 500));
    return;
  }

  let updates;
  try {
    updates = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Failed to parse updates JSON:', e.message);
    return;
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    console.log('No rate updates needed — rates look current.');
    updateNote(rateCard, today, [], 'No changes — rates confirmed current.');
    writeFileSync(RATE_CARD_PATH, JSON.stringify(rateCard, null, 2));
    return;
  }

  console.log(`Applying ${updates.length} rate update(s)...`);
  const applied = [];

  for (const update of updates) {
    for (const dept of rateCard.departments) {
      if (dept.label !== update.dept) continue;
      const role = dept.roles.find(r => r.name === update.role);
      if (!role) continue;

      const before = { typical: role.typical, low: role.low, high: role.high };
      if (update.typical) role.typical = update.typical;
      if (update.low) role.low = update.low;
      if (update.high) role.high = update.high;
      applied.push({ role: `${dept.label} › ${role.name}`, before, after: { typical: role.typical, low: role.low, high: role.high }, reason: update.reason });
      console.log(`  ✓ ${dept.label} › ${role.name}: $${before.typical} → $${role.typical}`);
    }
  }

  updateNote(rateCard, today, applied);
  writeFileSync(RATE_CARD_PATH, JSON.stringify(rateCard, null, 2));
  console.log(`rate-card.json updated (${applied.length} roles changed).`);
}

function updateNote(rateCard, date, changes, summary) {
  const changesSummary = changes.length > 0
    ? changes.map(c => `${c.role}: $${c.before.typical}→$${c.after.typical} (${c.reason})`).join('; ')
    : summary || 'No changes';
  rateCard._note = `Last reviewed: ${date}. ${changesSummary}. Rates reflect Southeast US (Atlanta) market.`;
  rateCard._lastReviewed = date;
}

main().catch(err => {
  console.error('Rate update failed:', err.message);
  process.exit(1);
});
