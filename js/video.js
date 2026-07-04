// ═══════════════════════════════════════════════════════════
// VIDEO EMBEDS — TikTok / YouTube / Instagram
// 옵션 C: 썸네일 → 클릭 시 임베드 활성화 (성능 최적)
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// 비디오 카드 HTML 생성 (썸네일 모드)
// ─────────────────────────────────────────────────────────
function renderVideoCard(video, recipeName) {
  // url이 있으면 임베드 가능, url_search만 있으면 검색 링크
  const hasEmbed = !!video.url;
  const platform = video.platform || 'youtube';

  // 플랫폼별 아이콘/색깔
  const platformMeta = {
    tiktok:    { icon: '📱', label: 'TikTok',    color: '#000000' },
    youtube:   { icon: '▶️', label: 'YouTube',   color: '#FF0000' },
    instagram: { icon: '📷', label: 'Instagram', color: '#E1306C' }
  };
  const meta = platformMeta[platform] || platformMeta.youtube;

  if (hasEmbed) {
    // 진짜 영상 URL 있으면 → 썸네일 → 클릭 시 임베드
    const videoId = extractVideoId(video.url, platform);
    return `
      <div class="video-card" data-platform="${platform}" data-url="${video.url}" data-video-id="${videoId}">
        <div class="video-thumb" onclick="activateVideoEmbed(this)">
          <div class="video-thumb__icon" style="background:${meta.color}">${meta.icon}</div>
          <div class="video-thumb__info">
            <div class="video-thumb__platform">${meta.label}${video.creator ? ' · ' + video.creator : ''}</div>
            <div class="video-thumb__title">${video.title || 'Watch how it\'s made'}</div>
          </div>
          <button class="video-thumb__play" aria-label="Play video">▶</button>
        </div>
      </div>
    `;
  } else {
    // url_search만 있으면 → 검색 링크
    const searchUrl = buildSearchUrl(platform, video.url_search || recipeName);
    return `
      <a class="video-card video-card--search"
         href="${searchUrl}"
         target="_blank"
         rel="noopener">
        <div class="video-thumb">
          <div class="video-thumb__icon" style="background:${meta.color}">${meta.icon}</div>
          <div class="video-thumb__info">
            <div class="video-thumb__platform">Search on ${meta.label}</div>
            <div class="video-thumb__title">${video.title || video.url_search}</div>
          </div>
          <span class="video-thumb__play">🔍</span>
        </div>
      </a>
    `;
  }
}

// ─────────────────────────────────────────────────────────
// 클릭 시 썸네일을 진짜 임베드로 교체
// ─────────────────────────────────────────────────────────
function activateVideoEmbed(thumbEl) {
  const card = thumbEl.parentElement;
  const platform = card.dataset.platform;
  const url = card.dataset.url;
  const videoId = card.dataset.videoId;

  let embedHtml = '';

  if (platform === 'youtube' && videoId) {
    embedHtml = `<iframe
      class="video-embed"
      src="https://www.youtube.com/embed/${videoId}?autoplay=1"
      title="YouTube video"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen></iframe>`;
  } else if (platform === 'tiktok' && videoId) {
    embedHtml = `<blockquote class="tiktok-embed"
      cite="${url}"
      data-video-id="${videoId}"
      style="max-width:605px;min-width:325px;margin:0 auto;">
      <a href="${url}">View on TikTok</a>
    </blockquote>
    <script async src="https://www.tiktok.com/embed.js"></script>`;
  } else if (platform === 'instagram') {
    embedHtml = `<blockquote class="instagram-media"
      data-instgrm-permalink="${url}"
      data-instgrm-version="14"
      style="margin:0 auto;">
      <a href="${url}">View on Instagram</a>
    </blockquote>
    <script async src="//www.instagram.com/embed.js"></script>`;
  } else {
    // 임베드 불가 → 새 탭으로 열기
    window.open(url, '_blank');
    return;
  }

  card.innerHTML = embedHtml;

  // TikTok/Instagram은 스크립트 동적 로드 필요
  if (platform === 'tiktok' || platform === 'instagram') {
    setTimeout(() => {
      if (window.instgrm && platform === 'instagram') window.instgrm.Embeds.process();
    }, 500);
  }
}

// ─────────────────────────────────────────────────────────
// URL에서 video ID 추출
// ─────────────────────────────────────────────────────────
function extractVideoId(url, platform) {
  if (!url) return null;
  if (platform === 'youtube') {
    // https://youtube.com/watch?v=XXX 또는 https://youtu.be/XXX
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/);
    return match ? match[1] : null;
  }
  if (platform === 'tiktok') {
    // https://tiktok.com/@user/video/12345
    const match = url.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  }
  if (platform === 'instagram') {
    // https://instagram.com/p/XXX 또는 /reel/XXX
    const match = url.match(/(?:\/p\/|\/reel\/)([^\/\?]+)/);
    return match ? match[1] : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// 플랫폼별 검색 URL (url 없을 때 fallback)
// ─────────────────────────────────────────────────────────
function buildSearchUrl(platform, query) {
  const q = encodeURIComponent(query);
  switch (platform) {
    case 'tiktok':    return `https://www.tiktok.com/search?q=${q}`;
    case 'youtube':   return `https://www.youtube.com/results?search_query=${q}`;
    case 'instagram': return `https://www.instagram.com/explore/tags/${query.replace(/\s+/g, '')}/`;
    default:          return `https://www.google.com/search?q=${q}`;
  }
}

// ─────────────────────────────────────────────────────────
// 레시피의 모든 비디오 카드 렌더링
// ─────────────────────────────────────────────────────────
function renderVideoSection(recipe) {
  const videos = recipe.videos || [];
  if (videos.length === 0) return '';

  return `
    <section class="recipe-videos">
      <h3 class="recipe-section__title">🎬 Watch how it's made</h3>
      <div class="video-list">
        ${videos.map(v => renderVideoCard(v, recipe.name)).join('')}
      </div>
      <p class="video-disclosure">
        Community-curated videos. Got a better one? <a href="#" onclick="suggestVideo('${recipe.id}'); return false;">Suggest a video →</a>
      </p>
    </section>
  `;
}

// ─────────────────────────────────────────────────────────
// 사용자 비디오 제보 (나중에 Supabase 연동)
// ─────────────────────────────────────────────────────────
function suggestVideo(recipeId) {
  const url = prompt(
    "Got a great video for this recipe?\n\n" +
    "Paste a TikTok / YouTube / Instagram URL:"
  );
  if (!url || !url.trim()) return;

  // TODO: Supabase에 저장
  // sb.from('video_suggestions').insert({ recipe_id, url, user_id })
  alert('Thanks! We\'ll review your suggestion.\n\n(Saving to DB — coming soon)');
}

// 전역 노출
window.VideoEmbed = {
  renderCard: renderVideoCard,
  renderSection: renderVideoSection,
  activate: activateVideoEmbed,
  suggest: suggestVideo
};
window.activateVideoEmbed = activateVideoEmbed;
window.suggestVideo = suggestVideo;
