// teams.js — All Teams page logic

// ── Energy-adjusted score (mirrors src/scorer.js) ───────────────────
// Below 92% energy: linear (energy/100 × OVR). Above 92%: diminishing returns.
function effectiveScore(ovr, energy) {
  energy = Math.min(100, Math.max(0, energy));
  if (energy <= 92) return (energy / 100) * ovr;
  return (0.92 + 0.08 * (1 - Math.exp(-3 * (energy - 92) / 8))) * ovr;
}

function lineupTotalEff(assignment) {
  return Object.values(assignment).reduce((sum, p) => sum + effectiveScore(p.ovr, p.energy), 0);
}

// ── Position group mapping ──────────────────────────────────────────
const POSITION_GROUPS = {
  GK: 'GK', GKP: 'GK',
  RB: 'DEF', LB: 'DEF', CB: 'DEF', RWB: 'DEF', LWB: 'DEF', SW: 'DEF',
  CM: 'MID', CDM: 'MID', CAM: 'MID', RM: 'MID', LM: 'MID',
  RW: 'ATK', LW: 'ATK', ST: 'ATK', CF: 'ATK', SS: 'ATK',
};
function groupOf(pos) { return POSITION_GROUPS[pos] || 'MID'; }

// ── Messaging ───────────────────────────────────────────────────────
function sendMsg(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

// ── DOM helpers ─────────────────────────────────────────────────────
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ── Skeleton card ───────────────────────────────────────────────────
function renderSkeleton() {
  const card = el('div', 'squad-card');
  const inner = el('div', 'squad-card-skeleton');
  inner.innerHTML = `
    <div class="skeleton-line wide"></div>
    <div class="skeleton-line narrow"></div>
    <div class="skeleton-line wide" style="margin-top:14px;height:10px;"></div>
    <div class="skeleton-line narrow" style="height:10px;"></div>
  `;
  card.appendChild(inner);
  return card;
}

// ── Pitch columns view ──────────────────────────────────────────────
function renderPitchCols(assignment, currentAssignment) {
  const groups = { GK: [], DEF: [], MID: [], ATK: [] };
  const slots = Object.keys(assignment).map(Number).sort((a, b) => a - b);
  for (const idx of slots) {
    const p = assignment[idx];
    const g = groupOf(p.position);
    if (!groups[g]) groups[g] = [];
    groups[g].push({ ...p, idx });
  }

  const container = el('div', 'pitch-cols');
  const cols = [
    { key: 'GK',  label: 'GK',         cls: 'gk',  extraCls: 'col-gk' },
    { key: 'DEF', label: 'Defenders',   cls: 'def', extraCls: '' },
    { key: 'MID', label: 'Midfielders', cls: 'mid', extraCls: '' },
    { key: 'ATK', label: 'Attackers',   cls: 'atk', extraCls: '' },
  ];

  for (const col of cols) {
    const players = groups[col.key] || [];
    if (players.length === 0) continue;
    const colEl = el('div', `pitch-col${col.extraCls ? ' ' + col.extraCls : ''}`);
    colEl.appendChild(el('div', `col-header ${col.cls}`, col.label));
    for (const p of players) {
      const isSwapped = currentAssignment && currentAssignment[p.idx]?.id !== p.id;
      const eff = effectiveScore(p.ovr, p.energy);
      const card = el('div', `player-card${isSwapped ? ' swapped' : ''}`);
      card.innerHTML = `
        <div class="pc-pos">${p.position}</div>
        <div class="pc-name">${p.name}${isSwapped ? ' ↑' : ''}</div>
        <div class="pc-stat">
          <span class="ovr">${p.ovr}</span>
          <span class="pc-eff" title="Energy-adjusted score (what the optimizer uses)">→ ${eff.toFixed(1)}</span>
          · ${p.energy}%
        </div>
      `;
      colEl.appendChild(card);
    }
    container.appendChild(colEl);
  }
  return container;
}

// ── Lineup row ──────────────────────────────────────────────────────
function renderLineupRow(lineup, currentAssignment, clubId) {
  const isCurrent = lineup.label === 'CURRENT';
  const isBest    = lineup.label === 'BEST';

  const row = el('div', `lineup-row${isBest ? ' lineup-best' : ''}`);

  let badgeCls = 'badge-alt';
  let badgeText = lineup.label.replace('_', ' ');
  if (isCurrent) { badgeCls = 'badge-current'; badgeText = 'CURRENT'; }
  if (isBest)    { badgeCls = 'badge-best';    badgeText = '★ BEST'; }

  const totalEff = lineupTotalEff(lineup.assignment);
  const summary = el('div', 'lineup-summary');
  summary.innerHTML = `
    <span class="lineup-badge ${badgeCls}">${badgeText}</span>
    <span class="lineup-desc">${lineup.description}</span>
    <span class="lineup-ovr ${isCurrent ? 'ovr-blue' : 'ovr-green'}">${lineup.totalOvr}</span>
    <span class="lineup-eff" title="Sum of energy-adjusted scores — what the optimizer maximises">${totalEff.toFixed(1)} eff</span>
    <span class="lineup-diff">${lineup.diff > 0 ? '+' + lineup.diff : ''}</span>
  `;

  const showBtn = el('button', 'btn-show', 'Show ▾');
  summary.appendChild(showBtn);

  const applyBtn = el('button', 'btn-apply', isCurrent ? 'Applied' : 'Apply');
  if (isCurrent) applyBtn.disabled = true;
  summary.appendChild(applyBtn);

  row.appendChild(summary);

  // Detail
  const detail = el('div', 'lineup-detail');
  detail.appendChild(renderPitchCols(lineup.assignment, currentAssignment));
  row.appendChild(detail);

  function toggleDetail() {
    const open = detail.classList.toggle('open');
    showBtn.textContent = open ? 'Hide ▴' : 'Show ▾';
  }
  summary.addEventListener('click', (e) => {
    if (e.target === applyBtn || e.target === showBtn) return;
    toggleDetail();
  });
  showBtn.addEventListener('click', toggleDetail);

  if (!isCurrent) {
    applyBtn.addEventListener('click', async () => {
      applyBtn.textContent = 'Applying…';
      applyBtn.className = 'btn-apply applying';
      applyBtn.disabled = true;

      const resp = await sendMsg({ type: 'OPTIMIZE_LINEUP', clubId, assignment: lineup.assignment });

      if (!resp?.success) {
        applyBtn.textContent = '✗ Failed';
        applyBtn.className = 'btn-apply apply-error';
        applyBtn.disabled = false;
        setTimeout(() => { applyBtn.textContent = 'Apply'; applyBtn.className = 'btn-apply'; }, 4000);
      } else {
        applyBtn.textContent = '✓ Applied';
        applyBtn.className = 'btn-apply';
        applyBtn.disabled = true;
      }
    });
  }

  return row;
}

// ── Squad card ──────────────────────────────────────────────────────
function renderSquadCard(club, previewData) {
  const card = el('div', 'squad-card');
  card.dataset.clubId = club.id;

  if (!previewData?.success) {
    const hdr = el('div', 'squad-card-header');
    hdr.innerHTML = `<div><div class="squad-name">${club.name}</div></div>`;
    card.appendChild(hdr);
    const errEl = el('div', 'card-error');
    errEl.textContent = `⚠ ${previewData?.error || 'Unknown error'}`;
    const retryBtn = el('button', 'btn-retry', 'Retry');
    retryBtn.style.marginLeft = '12px';
    retryBtn.addEventListener('click', () => loadAndReplaceCard(card, club));
    errEl.appendChild(retryBtn);
    card.appendChild(errEl);
    return card;
  }

  const { formationType, playerCount, currentOvr, lineups } = previewData;
  const bestLineup    = lineups.find(l => l.label === 'BEST');
  const currentLineup = lineups.find(l => l.label === 'CURRENT');
  const bestOvr = Math.max(...lineups.map(l => l.totalOvr));
  const diff = bestOvr - currentOvr;

  const hdr = el('div', 'squad-card-header');
  const right = el('div', 'squad-header-right');
  const expandBtn = el('button', 'btn-expand-all', 'Expand All');
  const ovrSummary = el('div', 'ovr-summary');
  ovrSummary.innerHTML = `
    <div class="ovr-current">Current OVR: ${currentOvr}</div>
    <div class="ovr-best">Best possible: ${bestOvr}${diff > 0 ? ` (+${diff})` : ''}</div>
  `;
  right.appendChild(expandBtn);
  right.appendChild(ovrSummary);
  hdr.innerHTML = `<div><div class="squad-name">${club.name}</div><div class="squad-meta">${formationType} · ${playerCount} players</div></div>`;
  hdr.appendChild(right);
  card.appendChild(hdr);

  const lineupsEl = el('div', 'lineups');
  const details = [];

  for (const lineup of lineups) {
    const row = renderLineupRow(lineup, currentLineup?.assignment, club.id);
    lineupsEl.appendChild(row);
    details.push(row.querySelector('.lineup-detail'));
  }
  card.appendChild(lineupsEl);

  expandBtn.addEventListener('click', () => {
    const allOpen = details.every(d => d.classList.contains('open'));
    details.forEach(d => {
      const open = !allOpen;
      d.classList.toggle('open', open);
      const btn = d.previousElementSibling?.querySelector('.btn-show');
      if (btn) btn.textContent = open ? 'Hide ▴' : 'Show ▾';
    });
    expandBtn.textContent = allOpen ? 'Expand All' : 'Collapse All';
  });

  if (bestLineup) card.dataset.bestAssignment = JSON.stringify(bestLineup.assignment);

  return card;
}

// ── Card retry helper ────────────────────────────────────────────────
async function loadAndReplaceCard(existingCard, club) {
  const skeleton = renderSkeleton();
  existingCard.replaceWith(skeleton);
  const previewData = await sendMsg({ type: 'PREVIEW_LINEUPS', clubId: club.id });
  const card = renderSquadCard(club, previewData || { success: false, error: 'No response.' });
  skeleton.replaceWith(card);
  return card;
}

// ── Main init ─────────────────────────────────────────────────────────
async function init() {
  const subtitleEl  = document.getElementById('page-subtitle');
  const mainEl      = document.getElementById('main-content');
  const optAllBtn   = document.getElementById('btn-optimize-all');

  const clubsResp = await sendMsg({ type: 'GET_CLUBS' });

  if (!clubsResp?.success) {
    const err = clubsResp?.error;
    const isAuthError = err === 'not_authenticated' || String(clubsResp?.error).includes('401');
    if (isAuthError) {
      mainEl.innerHTML = `
        <div class="state-page">
          <div class="state-icon">🔒</div>
          <h2>Session expired</h2>
          <p>Your MFL session has expired. <a href="https://app.playmfl.com" target="_blank">Log back in at playmfl.com</a>, then return here and reload.</p>
          <button class="btn-retry" onclick="location.reload()">Retry</button>
        </div>`;
    } else {
      mainEl.innerHTML = `
        <div class="state-page">
          <div class="state-icon">⚠️</div>
          <h2>Failed to load clubs</h2>
          <p>${clubsResp?.error || 'Unknown error'}</p>
          <button class="btn-retry" onclick="location.reload()">Retry</button>
        </div>`;
    }
    return;
  }

  const { username, clubs } = clubsResp;
  subtitleEl.textContent = `${username} · ${clubs.length} club${clubs.length !== 1 ? 's' : ''}`;

  if (clubs.length === 0) {
    mainEl.innerHTML = `
      <div class="state-page">
        <div class="state-icon">🏟️</div>
        <h2>No clubs found</h2>
        <p>No clubs were found for your account.</p>
      </div>`;
    return;
  }

  // Insert skeletons
  const skeletons = clubs.map(() => { const s = renderSkeleton(); mainEl.appendChild(s); return s; });

  // Load all in parallel
  const loadedCards = await Promise.all(clubs.map(async (club, i) => {
    const previewData = await sendMsg({ type: 'PREVIEW_LINEUPS', clubId: club.id });
    const card = renderSquadCard(club, previewData || { success: false, error: 'No response.' });
    skeletons[i].replaceWith(card);
    return card;
  }));

  // Optimize All
  optAllBtn.disabled = false;
  optAllBtn.addEventListener('click', async () => {
    optAllBtn.textContent = 'Optimizing…';
    optAllBtn.className = 'btn-optimize-all optimizing';
    optAllBtn.disabled = true;

    for (const card of loadedCards) {
      const clubId = card.dataset.clubId;
      const assignmentJson = card.dataset.bestAssignment;
      if (!clubId || !assignmentJson) continue;
      let assignment;
      try { assignment = JSON.parse(assignmentJson); } catch (_) { continue; }

      const resp = await sendMsg({ type: 'OPTIMIZE_LINEUP', clubId, assignment });
      if (!resp?.success) {
        let errEl = card.querySelector('.opt-all-error');
        if (!errEl) { errEl = el('div', 'card-error opt-all-error'); card.appendChild(errEl); }
        errEl.textContent = `⚠ Optimize failed: ${resp?.error || 'Unknown error'}`;
      }
    }

    optAllBtn.textContent = '✓ All Done';
    optAllBtn.className = 'btn-optimize-all';
    setTimeout(() => {
      optAllBtn.textContent = '⚡ Optimize All Squads';
      optAllBtn.disabled = false;
    }, 4000);
  });
}

document.addEventListener('DOMContentLoaded', init);
