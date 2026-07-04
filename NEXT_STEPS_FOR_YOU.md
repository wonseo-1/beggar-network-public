# 다음 단계 — 정확한 명령어

이 폴더(`beggar-network-public/`)를 그대로 새 공개 레포로 push하면 됩니다.
원본 라이브 사이트(`Desktop/poorguys`, Vercel 배포 중)는 이 작업과 무관하며 전혀 건드리지 않았습니다.

## 0. 사전 점검 (한 번만, 필수)

```bash
cd ~/Claude/Projects/거지네트워크/beggar-network-public
node build/generate-static.mjs
```

`data/api/v1/*.json`, `recipe/<slug>/index.html`, `sitemap.xml`이 정상 생성되는지 확인하세요.
(이 스크립트는 문법 체크만 했고, 실제 Supabase 호출은 네트워크가 막힌 샌드박스에서 테스트하지 못했습니다 — push 전에 반드시 로컬에서 한 번 돌려보세요.)

## 1. 깃 초기화 + 커밋

```bash
cd ~/Claude/Projects/거지네트워크/beggar-network-public
git init
git add .
git commit -m "Initial public release"
```

## 2. 새 공개 레포 생성 + push

**GitHub CLI(`gh`)가 있는 경우** (없으면 `brew install gh` 후 `gh auth login`):

```bash
gh repo create beggar-network --public --source=. --remote=origin --push
```

**`gh` 없이 수동으로 하는 경우**:
1. https://github.com/new 에서 레포 이름 `beggar-network`, **Public** 선택, README/gitignore/license 아무것도 체크하지 말고 Create
2. 터미널에서:
```bash
git remote add origin git@github.com:<본인계정>/beggar-network.git
git branch -M main
git push -u origin main
```

## 3. GitHub Pages 켜기

레포 페이지 → **Settings → Pages** → Source: `main` 브랜치 / `/ (root)` → **Save**.
몇 분 후 `https://<본인계정>.github.io/beggar-network/`에서 확인 가능.

커스텀 도메인 쓸 거면 같은 화면에서 도메인 입력 + 도메인 등록업체에 CNAME 레코드 추가.

## 4. Supabase에 관리자 이메일 리팩터 반영

지금 라이브 DB는 아직 옛날 방식(정책마다 이메일 하드코딩)으로 돌아가고 있어요.
Supabase 대시보드 → **SQL Editor**에서 `sql/admin_config.sql` 파일 내용을 그대로
붙여넣고 실행해야 새 `is_admin()` 방식이 켜집니다.

지금 이메일 값 그대로 두면 동작은 기존과 완전히 동일합니다. 나중에 관리자 이메일을
바꿀 때는 이 파일의 이메일 값만 바꿔서 다시 실행하면 됩니다.

## 5. 확인 체크리스트

- [ ] GitHub Pages URL에서 지도가 뜨는지 (0단계에서 스냅샷 생성 확인 안 했으면 여기서 빈 지도로 보일 것)
- [ ] 가게 제출 / Judge 검증이 정상 동작하는지 (Supabase 직결이라 원래대로 작동해야 함)
- [ ] `/recipe/<slug>` 페이지들이 정상인지
- [ ] `/admin.html` 로그인 되는지
- [ ] 다 확인되면 Vercel 프로젝트는 얼마간(예: 2주) 병행 유지 후 정리

문제 생기면 원본(`Desktop/poorguys`, Vercel)은 그대로 살아있으니 언제든 롤백 가능합니다.

## 참고: `api/` 폴더

`api/recipe.js`, `api/sitemap.js`는 Vercel 서버리스 함수예요(GitHub Pages에선 실행 안 됨,
그냥 정적 파일로 취급됨 — 해는 없음). Vercel 병행 운영 끝나고 완전히 GitHub Pages로
넘어가면 이 폴더는 지워도 됩니다. `api/og.js`(안 쓰이던 것)는 이번에 제거했어요.

## 이미 끝낸 작업 요약

1. **정리** — `scrape_gmaps_menu_v2.py`, `gmaps-menu-ocr/`, `scripts/`(옐프 스크래핑 포함),
   `sql/update_vanessa.sql`, `docs/`(내부 기획 문서) 전부 이 사본에서 제외.
2. **가짜 데이터 제거** — `js/sprites-data.js`의 `window.SPOTS`/`RECENT_VERDICTS`/
   `COURT_QUEUE`/`LEADERBOARD` (72줄, 전부 죽은 코드였음) 삭제.
3. **관리자 이메일 중앙화** — `js/admin-config.js` 하나로 모음(auth.js/admin.js 참조).
   SQL 쪽은 `sql/admin_config.sql` + `is_admin()` 함수로 리팩터링(모든 정책에서
   이메일 하드코딩 15곳 이상 제거).
4. **정적 스냅샷 빌더** — `build/generate-static.mjs` + `.github/workflows/build-snapshot.yml`
   (30분마다 자동 실행 + 수동 실행 버튼).
5. **`js/map.js`의 `loadData()`** — Supabase 실시간 쿼리 대신 정적 스냅샷 fetch로 교체.
   쓰기(제출/검증)는 그대로 Supabase 직결.
6. **`DATA_LICENSE.md`, `README.md`, `LICENSE`(MIT), `.nojekyll`** 추가.

전체 배경/맥락은 원본 프로젝트의 `docs/github-public-migration-plan.md`에 있어요.
