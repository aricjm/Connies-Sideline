/* ==========================================================================
   Connie's Sideline — Application logic
   ESPN public API (no key required): https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/{resource}
   ========================================================================== */

(() => {
  'use strict';

  const LEAGUES = [
    { sport: 'football',   league: 'college-football',      label: 'Football' },
    { sport: 'basketball', league: 'mens-college-basketball', label: "Men's Basketball" },
    { sport: 'basketball', league: 'womens-college-basketball', label: "Women's Basketball" }
  ];

  const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

  const TZ_MAP = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Los_Angeles': 'PT'
  };

  const DEFAULT_TZ = 'America/Chicago';

  const els = {
    gamesList: document.getElementById('gamesList'),
    emptyState: document.getElementById('emptyState'),
    gamesContainer: document.getElementById('gamesContainer'),
    dateInput: document.getElementById('gameDate'),
    refreshOverlay: document.getElementById('refreshOverlay'),
    refreshBtn: document.getElementById('refreshBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    settingsCloseBtn: document.getElementById('settingsCloseBtn'),
    statsModal: document.getElementById('statsModal'),
    statsCloseBtn: document.getElementById('statsCloseBtn'),
    statsModalTitle: document.getElementById('statsModalTitle'),
    statsModalBody: document.getElementById('statsModalBody')
  };

  const state = {
    selectedDate: null,
    timezone: DEFAULT_TZ,
    games: [],
    loading: false
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function yyyymmdd(dateStr) {
    return dateStr.replace(/-/g, '');
  }

  function formatTimeInTZ(isoString, tz) {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) { return '--:--'; }
  }

  function formatDateInTZ(isoString, tz) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem('connie_sideline_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.timezone && TZ_MAP[parsed.timezone]) state.timezone = parsed.timezone;
      }
    } catch (e) {}
  }

  function saveSettings() {
    try { localStorage.setItem('connie_sideline_settings', JSON.stringify({ timezone: state.timezone })); } catch (e) {}
  }

  async function espnFetch(path) {
    const url = `${ESPN_BASE}/${path}`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`ESPN ${res.status} for ${path}`);
    return res.json();
  }

  function getScoreboardPath(sport, league, dateStr) {
    return `/${sport}/${league}/scoreboard?dates=${yyyymmdd(dateStr)}`;
  }

  function getSummaryPath(eventId, sport, league) {
    return `/${sport}/${league}/summary?event=${eventId}`;
  }

  function isIowaTeam(team) {
    if (!team) return false;
  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function render() {
    const { games } = state;
    const list = els.gamesList;
    list.innerHTML = '';
    if (games.length === 0) {
      els.emptyState.style.display = 'flex';
      return;
    }
    els.emptyState.style.display = 'none';
    games.forEach(game => {
      const card = createGameCard(game, state.timezone);
      list.appendChild(card);
    });
  }

    const name = (team.name || '').toLowerCase();
    const abbr = (team.abbreviation || '').toUpperCase();
  function createGameCard(game, timezone) {
    const { sport, competition } = game;
    const comps = competition.competitors || [];
    const awayComp = comps.find(c => (c.homeAway || '').toLowerCase() === 'away') || comps[0] || {};
    const homeComp = comps.find(c => (c.homeAway || '').toLowerCase() === 'home') || comps[1] || {};
    const awayTeam = awayComp.team || {};
    const homeTeam = homeComp.team || {};
    const status = competition.status || {};
    const statusType = status.type || {};
    const statusShort = (statusType.shortName || '').toLowerCase();
    const isLive = statusShort === 'in progress' || statusShort === 'live';
    const isFinal = statusType.completed === true || statusShort === 'final' || statusShort === 'off';

    const card = document.createElement('article');
    card.className = `game-card ${isLive ? 'live' : ''} ${isFinal ? 'final' : ''}`;

    const broadcasts = competition.broadcasts || [];
    const broadcastNames = broadcasts.map(b => b.names ? b.names.join(', ') : (b.name || '')).filter(Boolean);

    const isoDate = competition.date || game.date;
    const timeStr = formatTimeInTZ(isoDate, timezone);

    const header = document.createElement('div');
    header.className = 'game-header';
    const meta = document.createElement('div');
    meta.className = 'game-meta';
    const dateSpan = document.createElement('span');
    dateSpan.textContent = isoDate ? formatDateInTZ(isoDate, timezone) : '';
    meta.appendChild(dateSpan);
    const timeSpan = document.createElement('span');
    timeSpan.textContent = timeStr;
    meta.appendChild(timeSpan);
    const tag = document.createElement('span');
    tag.className = `game-status-tag ${isLive ? 'live' : isFinal ? 'final' : 'upcoming'}`;
    tag.textContent = isLive ? 'Live' : isFinal ? 'Final' : 'Upcoming';
    header.appendChild(meta);
    header.appendChild(tag);
    if (broadcastNames.length) {
      const bc = document.createElement('div');
      bc.className = 'broadcasters';
      bc.textContent = broadcastNames.join(' \u2022 ');
      header.appendChild(bc);
    }
    card.appendChild(header);
    const scoreboard = document.createElement('div');
    scoreboard.className = 'scoreboard';

    const awayRow = document.createElement('div');
    awayRow.className = 'score-row away';
    awayRow.appendChild(teamCell(awayTeam, awayComp.score));
    awayRow.appendChild(periodBoxes(sport, awayComp, homeComp, 'away'));
    awayRow.appendChild(scoreCell(awayComp.score));
    scoreboard.appendChild(awayRow);

    const homeRow = document.createElement('div');
    homeRow.className = 'score-row home';
    homeRow.appendChild(teamCell(homeTeam, homeComp.score));
    homeRow.appendChild(periodBoxes(sport, awayComp, homeComp, 'home'));
    homeRow.appendChild(scoreCell(homeComp.score));
    scoreboard.appendChild(homeRow);

    const totalRow = document.createElement('div');
    totalRow.className = 'total-row';
    const totalLabel = document.createElement('span');
    totalLabel.className = 'total-label';
    totalLabel.textContent = 'Final';
    const awayTotal = document.createElement('span');
    awayTotal.className = 'total-score';
    awayTotal.textContent = awayComp.score ?? '';
    const homeTotal = document.createElement('span');
    homeTotal.className = 'total-score';
    homeTotal.textContent = homeComp.score ?? '';
    totalRow.appendChild(totalLabel);
    totalRow.appendChild(awayTotal);
    totalRow.appendChild(homeTotal);
    scoreboard.appendChild(totalRow);

    card.appendChild(scoreboard);

    const toggle = document.createElement('button');
    toggle.className = 'stats-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span>Game stats &amp; leaders</span><div class="chevron"></div>';
    const content = document.createElement('div');
    content.className = 'stats-content';
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.classList.toggle('expanded');
      content.classList.toggle('open');
      if (!expanded && !content.dataset.loaded) {
        loadGameStats(game, content);
        content.dataset.loaded = '1';
      }
    });
    card.appendChild(toggle);
    card.appendChild(content);
    return card;
  }


    return name.includes('iowa') || abbr === 'IOWA';
  }

  function teamLogoUrl(team) {
    if (team && team.logo) return team.logo;
    if (team && team.logos && team.logos.length) return team.logos[0].href;
    return null;
  }

  function teamInitial(team) {
    const abbr = (team && team.abbreviation) || '';
    if (abbr) return abbr.slice(0, 2).toUpperCase();
    const name = (team && team.name) || '';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  }

  function competitorPeriodScores(competitor) {
    const scores = competitor.scores;
    if (Array.isArray(scores)) {
      return scores.map(s => ({ period: (s.period && s.period.number) || s.period || null, value: s.value != null ? String(s.value) : null })).filter(s => s.value != null);
    }
    return [];
  }

  function periodConfig(sport) {
    if (sport === 'football') return { count: 4, label: (i) => `Q${i}` };
    return { count: 2, label: (i) => `H${i}` };
  }

  function buildPeriods(sport, awayComp, homeComp) {
    const cfg = periodConfig(sport);
    const awayScores = competitorPeriodScores(awayComp);
    const homeScores = competitorPeriodScores(homeComp);
    const awayMap = {};
    const homeMap = {};
    awayScores.forEach(s => { if (s.period != null) awayMap[s.period] = s.value; });
    homeScores.forEach(s => { if (s.period != null) homeMap[s.period] = s.value; });
    const boxes = [];
    for (let i = 1; i <= cfg.count; i++) {
      const aVal = awayMap[i] != null ? awayMap[i] : '';
      const hVal = homeMap[i] != null ? homeMap[i] : '';
      boxes.push({ label: cfg.label(i), away: aVal, home: hVal, hasScore: aVal !== '' || hVal !== '' });
    }
    return boxes;
  }
  function teamCell(team) {
    const cell = document.createElement('div');
    cell.className = 'team-cell';
    const logoWrap = document.createElement('div');
    logoWrap.className = 'team-logo';
    const logoUrl = teamLogoUrl(team);
    if (logoUrl) {
      const img = document.createElement('img');
      img.src = logoUrl;
      img.alt = `${team.name} logo`;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      logoWrap.appendChild(img);
    } else {
      logoWrap.textContent = teamInitial(team);
    }
    cell.appendChild(logoWrap);
    const info = document.createElement('div');
    info.className = 'team-info';
    const name = document.createElement('div');
    name.className = 'team-name';
    name.textContent = team.name || 'TBD';
    const abbr = document.createElement('div');
    abbr.className = 'team-abbr';
    abbr.textContent = team.abbreviation ? team.abbreviation.toUpperCase() : '';
    info.appendChild(name);
    info.appendChild(abbr);
    cell.appendChild(info);
    return cell;
  }

  function periodBoxes(sport, awayComp, homeComp, side) {
    const wrap = document.createElement('div');
    wrap.className = 'periods';
    const boxes = buildPeriods(sport, awayComp, homeComp);
    boxes.forEach(b => {
      const el = document.createElement('div');
      el.className = `period-box ${b.hasScore ? 'has-score' : ''}`;
      el.textContent = side === 'away' ? b.away : b.home;
      if (!b.hasScore) el.textContent = b.label;
      wrap.appendChild(el);
    });
    return wrap;
  }

  function scoreCell(score) {
    const cell = document.createElement('div');
    cell.className = 'team-score';
    cell.textContent = score ?? '';
    return cell;
  }

  // ------------------------------------------------------------------
  // Stats detail (accordion) — fetch summary for boxscore / player leaders
  // ------------------------------------------------------------------
  async function loadGameStats(game, contentEl) {
    contentEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Loading stats&hellip;</div>';
    try {
      const summary = await espnFetch(getSummaryPath(game.eventId, game.sport, game.league));
      renderStatsContent(contentEl, game, summary);
    } catch (e) {
      contentEl.innerHTML = '<div style="color:var(--away-score);font-size:13px;padding:8px 0;">Unable to load stats.</div>';
    }
  }

  function renderStatsContent(contentEl, game, summary) {
    const boxscore = summary.boxscore || {};
    const teams = boxscore.teams || [];
    contentEl.innerHTML = '';

    const teamStatsSec = document.createElement('div');
    teamStatsSec.className = 'stat-section';
    const teamStatsTitle = document.createElement('div');
    teamStatsTitle.className = 'stat-title';
    teamStatsTitle.textContent = 'Team Stats';
    teamStatsSec.appendChild(teamStatsTitle);

    let teamStatsAdded = false;
    teams.forEach(t => {
      const stats = t.teamStatistics || [];
      stats.forEach(s => {
        const row = document.createElement('div');
        row.className = 'stat-row';
        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = s.name || s.displayName || 'Stat';
        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = s.displayValue != null ? s.displayValue : s.value;
        row.appendChild(label);
        row.appendChild(value);
        teamStatsSec.appendChild(row);
        teamStatsAdded = true;
      });
    });

    const leadersSec = document.createElement('div');
    leadersSec.className = 'stat-section';
    const leadersTitle = document.createElement('div');
    leadersTitle.className = 'stat-title';
    leadersTitle.textContent = 'Player Leaders';
    leadersSec.appendChild(leadersTitle);

    let leadersAdded = false;
    teams.forEach(t => {
      const players = t.players || [];
      players.forEach(p => {
        const athlete = p.athlete || {};
        const stats = p.statistics || [];
        if (!stats.length) return;
        const primary = stats[0];
        const row = document.createElement('div');
        row.className = 'player-row';
        const nameWrap = document.createElement('div');
        nameWrap.className = 'player-name';
        nameWrap.textContent = athlete.name || 'Unknown';
        const meta = document.createElement('div');
        meta.className = 'player-meta';
        meta.textContent = (athlete.position && athlete.position.abbreviation) ? athlete.position.abbreviation : '';
        nameWrap.appendChild(meta);
        const val = document.createElement('span');
        val.className = 'player-stat';
        val.textContent = primary.displayValue != null ? primary.displayValue : primary.value;
        row.appendChild(nameWrap);
        row.appendChild(val);
        leadersSec.appendChild(row);
        leadersAdded = true;
      });
    });

    if (teamStatsAdded) contentEl.appendChild(teamStatsSec);
    if (leadersAdded) contentEl.appendChild(leadersSec);
    if (!teamStatsAdded && !leadersAdded) {
      contentEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">No detailed stats available for this game.</div>';
    }
  }

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------
  async function loadGames(dateStr) {
    state.loading = true;
    showRefresh(true);

    try {
      const fetched = await Promise.all(
        LEAGUES.map(async (lg) => {
          try {
            const data = await espnFetch(getScoreboardPath(lg.sport, lg.league, dateStr));
            const events = data.events || [];
            return events.map(ev => ({
              eventId: ev.id,
              sport: lg.sport,
              league: lg.league,
              leagueLabel: lg.label,
              name: ev.name || ev.shortName || '',
              date: ev.date,
              competition: ev.competitions ? ev.competitions[0] : ev
            }));
          } catch (e) {
            console.warn(`Failed to load ${lg.league}:`, e.message);
            return [];
          }
        })
      );

      let allGames = fetched.flat();
      const iowaGames = allGames.filter(g => {
        const comps = (g.competition && g.competition.competitors) || [];
        return comps.some(c => isIowaTeam(c.team));
      });

      iowaGames.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return da - db;
      });

      state.games = iowaGames;
      state.selectedDate = dateStr;
      render();
    } catch (e) {
      console.error('loadGames error:', e);
      state.games = [];
      render();
    } finally {
      state.loading = false;
      showRefresh(false);
    }
  }

  function showRefresh(show) {
    if (show) els.refreshOverlay.classList.add('show');
    else els.refreshOverlay.classList.remove('show');
  }

  // ------------------------------------------------------------------
  // Pull-to-refresh (touch)
  // ------------------------------------------------------------------
  let touchStartY = 0;
  let pullY = 0;
  let isPulling = false;

  function startPull(e) {
    if (els.gamesContainer.scrollTop > 0) return;
    touchStartY = e.touches ? e.touches[0].clientY : e.clientY;
    isPulling = true;
  }

  function movePull(e) {
    if (!isPulling) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const diff = y - touchStartY;
    if (diff <= 0) return;
    e.preventDefault();
    pullY = Math.min(diff * 0.5, 100);
    if (pullY > 60) els.refreshOverlay.classList.add('show');
    else els.refreshOverlay.classList.remove('show');
  }

  function endPull() {
    if (!isPulling) return;
    isPulling = false;
    els.refreshOverlay.classList.remove('show');
    if (pullY > 60) {
      loadGames(state.selectedDate || todayISO());
    }
    pullY = 0;
  }

  // ------------------------------------------------------------------
  // Settings modal
  // ------------------------------------------------------------------
  function openSettings() {
    els.settingsModal.classList.add('open');
    $$('.tz-btn', els.settingsModal).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tz === state.timezone);
    });
  }

  function closeSettings() {
    els.settingsModal.classList.remove('open');
  }

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------
  function init() {
    loadSettings();

    const today = todayISO();
    els.dateInput.value = today;
    els.dateInput.max = today;

    try {
      const saved = localStorage.getItem('connie_sideline_date');
      if (saved && saved <= today) {
        els.dateInput.value = saved;
        state.selectedDate = saved;
      } else {
        state.selectedDate = today;
      }
    } catch (e) {
      state.selectedDate = today;
    }

    els.dateInput.addEventListener('change', (e) => {
      const val = e.target.value;
      try { localStorage.setItem('connie_sideline_date', val); } catch (e) {}
      state.selectedDate = val;
      loadGames(val);
    });

    els.refreshBtn.addEventListener('click', () => {
      loadGames(state.selectedDate || todayISO());
    });

    els.settingsBtn.addEventListener('click', openSettings);
    els.settingsCloseBtn.addEventListener('click', closeSettings);
    els.settingsModal.addEventListener('click', (e) => {
      if (e.target === els.settingsModal) closeSettings();
    });

    $$('.tz-btn', els.settingsModal).forEach(btn => {
      btn.addEventListener('click', () => {
        state.timezone = btn.dataset.tz;
        saveSettings();
        $$('.tz-btn', els.settingsModal).forEach(b => b.classList.toggle('active', b === btn));
        render();
      });
    });

    els.statsCloseBtn.addEventListener('click', () => {
      els.statsModal.classList.remove('open');
    });
    els.statsModal.addEventListener('click', (e) => {
      if (e.target === els.statsModal) els.statsModal.classList.remove('open');
    });

    const container = els.gamesContainer;
    container.addEventListener('touchstart', startPull, { passive: false });
    container.addEventListener('touchmove', movePull, { passive: false });
    container.addEventListener('touchend', endPull);
    container.addEventListener('touchcancel', endPull);

    loadGames(state.selectedDate || todayISO());
  }

  document.addEventListener('DOMContentLoaded', init);
})();
