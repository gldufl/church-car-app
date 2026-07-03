# 초청교회 배차 신청 — 정식 배포 가이드

기존 Claude 아티팩트 코드를 **그대로** Supabase + Vercel로 옮긴 프로젝트입니다.
화면과 기능은 100% 동일하고, 데이터 저장 방식만 Claude → Supabase로 바뀌었습니다.

## 1. Supabase 프로젝트 만들기 (5분)

1. https://supabase.com 가입 → **New Project** 생성 (무료 플랜으로 충분합니다)
2. 왼쪽 메뉴 **SQL Editor** 클릭 → 이 폴더의 `supabase-schema.sql` 내용을 통째로 붙여넣고 **Run**
3. 왼쪽 메뉴 **Settings → API** 이동 → 아래 두 값을 복사해 둡니다
   - `Project URL`
   - `anon public` key

## 2. 로컬에서 실행해보기 (선택, 확인용)

```bash
# Node.js가 설치되어 있어야 합니다 (nodejs.org)
npm install
cp .env.example .env
```

`.env` 파일을 열어서 1번에서 복사해둔 값을 넣습니다:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

```bash
npm run dev
```
`http://localhost:5173` 에서 앱이 뜨면 성공입니다. 회원가입 → 관리자 로그인(admin/0000)까지 테스트해보세요.

## 3. GitHub에 올리기

```bash
git init
git add .
git commit -m "초청교회 배차 신청 초기 배포"
```
GitHub에서 새 저장소(예: `church-car-booking`)를 만든 뒤:
```bash
git remote add origin https://github.com/본인계정/church-car-booking.git
git branch -M main
git push -u origin main
```

## 4. Vercel로 배포하기 (5분)

1. https://vercel.com 가입 (GitHub 계정으로 로그인하면 편합니다)
2. **Add New → Project** → 방금 만든 GitHub 저장소 선택 → **Import**
3. **Environment Variables** 항목에 아래 두 개를 등록
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy** 클릭 → 1~2분 후 `church-car-booking-xxxx.vercel.app` 같은 주소가 생성됩니다

이 주소를 성도님들께 카카오톡으로 공유하면 됩니다. Claude 계정이 전혀 필요 없고, 앱 안의 회원가입/로그인만으로 누구나 이용할 수 있습니다.

## 5. 이후 기능 수정은 어떻게 하나요?

이 대화(Claude)에서 계속 기능을 요청하시면, 제가 `src/App.jsx` 파일을 수정해 드립니다.
수정된 파일을 받으시면:
```bash
# 기존 src/App.jsx를 새 파일로 교체한 뒤
git add .
git commit -m "기능 수정"
git push
```
Vercel은 GitHub에 push할 때마다 **자동으로 재배포**되므로, 성도님들이 쓰시는 링크는 그대로 유지된 채 내용만 업데이트됩니다.

## 참고: 관리자 계정

- 최초 관리자 아이디/비밀번호: `admin` / `0000`
- 로그인 후 **관리자 모드 → 계정 설정**에서 반드시 바꿔주세요
- 배포 직후, 다른 운전자에게 "운전자 관리" 탭에서 관리자 권한을 추가로 부여할 수 있습니다

## 주의사항

- 이 구조는 비밀번호를 암호화 없이 저장합니다 (기존 아티팩트와 동일한 방식을 유지). 교회 내부용으로는 충분하지만, 성도님들께 다른 곳과 같은 비밀번호를 쓰지 않도록 안내해 주세요.
- 나중에 Supabase Auth로 전환해 비밀번호를 암호화하고 싶으시면 언제든 요청해 주세요.

