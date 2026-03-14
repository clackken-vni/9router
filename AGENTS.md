# 9Router — Agent Instructions

## Tổng quan dự án
**9Router** là local AI routing gateway + dashboard, cung cấp endpoint OpenAI-compatible (`/v1/*`) và tự động route/fallback qua nhiều provider.

- **Repository**: https://github.com/clackken-vni/9router
- **Runtime mặc định (dev)**: `http://localhost:20127`
- **Dashboard**: `/dashboard`
- **API compatible**: `/v1/*` (rewrite về `/api/v1/*`)

## Tech Stack
| Layer | Công nghệ |
|---|---|
| Web App | Next.js 16 (App Router), React 19 |
| UI | Tailwind CSS v4 |
| Runtime | Node.js 20+ |
| Storage | LowDB (JSON), usage DB file-based |
| Streaming | SSE (`src/sse`, `open-sse`) |
| Auth | JWT cookie + API key + OAuth providers |

## Cấu trúc code quan trọng
```
9router/
├── src/
│   ├── app/                      # Next.js app + API routes
│   │   ├── (dashboard)/          # Dashboard pages
│   │   └── api/                  # Management APIs + v1 compatibility APIs
│   ├── sse/                      # Chat handlers, model resolution
│   ├── shared/                   # Shared services/utils
│   ├── lib/                      # DB, sync init, infra helpers
│   ├── proxy.js                  # Route guard config
│   └── dashboardGuard.js         # Dashboard auth guard
├── open-sse/                     # Provider executors, translators, stream utils
├── bin/                          # CLI bootstrap / tray mode
├── tester/                       # Security/cloud test scripts
├── wt.sh                         # Worktree helper script
└── docs/ARCHITECTURE.md          # Kiến trúc chi tiết
```

## Flow chính cần hiểu trước khi sửa
1. Client gọi `/v1/*`
2. Rewrite sang `/api/v1/*`
3. `src/sse/handlers/chat.js` + `open-sse/handlers/chatCore.js` xử lý translate, execute, fallback
4. Persist state/usage qua `src/lib/localDb.js` + `src/lib/usageDb.js`

## Quy ước code trong repo
- **Ngôn ngữ code**: JavaScript (chủ đạo), style hiện tại dùng `"` + `;`.
- **Alias import**: `@/*` map tới `src/*` (xem `jsconfig.json`).
- **Không tự ý TypeScript hóa** file JS hiện có nếu user không yêu cầu.
- **Không thêm abstraction lớn** khi chỉ sửa bug nhỏ.
- **Không thêm comment thừa**; chỉ thêm khi logic phức tạp và cần thiết.
- **Giữ đúng pattern App Router** (route handlers trong `src/app/api/**/route.js`).

## Security & dữ liệu nhạy cảm (BẮT BUỘC)
- Tuyệt đối không hardcode hoặc log secret/token/password.
- Không chỉnh sửa hay commit các file nhạy cảm: `.env`, `secrets.json`, dữ liệu thực trong `data/`, `logs/`.
- Khi cần debug request logging, dùng `ENABLE_REQUEST_LOGS=true` và tắt lại sau khi verify.
- Với endpoint public/internet, ưu tiên giữ `REQUIRE_API_KEY=true` trong hướng dẫn deploy.

## Commands thường dùng
```bash
npm install
npm run dev          # port 20127
npm run dev:alt      # port 20126
npm run build
npm run start
npm run start:tray
```

## Worktree workflow (khuyến nghị mạnh)
Repo có `wt.sh`; ưu tiên làm việc qua worktree cho task code:

```bash
./wt.sh create <issue> <short-desc>
./wt.sh list
./wt.sh dev <issue>
./wt.sh build <issue>
./wt.sh remove <issue>
```

Quy tắc:
1. Mỗi issue/tác vụ độc lập nên có 1 worktree.
2. Không dùng `git add .` hoặc `git add -A`; chỉ stage file liên quan.
3. Không commit/push nếu user chưa yêu cầu rõ.

## Git & Issue Conventions
- **Branch naming**: `feature/<issue-number>-short-description` hoặc `fix/<issue-number>-short-description`.
- **Commit messages**: Conventional commits — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- **Commit message format**: `feat(#<issue-number>): short description`.
- **Issue labels**: dùng labels có sẵn; Epic dùng pattern `epic:<feature-name>`.
- **Never commit**: `.env`, `node_modules/`, `data/`, `logs/`, secrets thực tế.
- **Never use**: `git add -A` hoặc `git add .` — luôn stage file cụ thể.

## Git Worktree Workflow (BẮT BUỘC)
⛔ Mọi thay đổi code phải thực hiện trong worktree; main working directory chỉ dùng để đọc/nghiên cứu.

### Quy tắc (BẮT BUỘC)
1. Không edit source trong main repo — chỉ edit trong worktree.
2. Luôn dùng `./wt.sh` để tạo/quản lý worktree.
3. Mỗi issue = 1 worktree.
4. Tách port dev theo issue khi cần (`./wt.sh dev <issue>` hoặc `./wt.sh dev <issue> alt`).
5. Không cài dependencies trong worktree trừ khi user yêu cầu rõ.
6. Dọn worktree sau khi issue/epic hoàn tất để tránh rác.

### Commands
| Action | Command |
|---|---|
| Create worktree | `./wt.sh create <issue> <short-desc>` |
| Start dev server | `./wt.sh dev <issue>` |
| Start dev server alt port | `./wt.sh dev <issue> alt` |
| Build in worktree | `./wt.sh build <issue>` |
| List worktrees | `./wt.sh list` |
| Remove worktree (keep branch) | `./wt.sh remove <issue>` |
| Remove worktree + branch | `./wt.sh remove <issue> --branch` |

### Anti-patterns (VI PHẠM)
- ❌ Edit `src/` hoặc file code trực tiếp ở main repo.
- ❌ Tạo branch issue nhưng không dùng worktree.
- ❌ Dùng chung một worktree cho nhiều issue.

## Issue-Driven Workflow (BẮT BUỘC)
Mọi thay đổi code PHẢI được driven bởi GitHub issue. Sử dụng `gh` CLI cho toàn bộ thao tác GitHub.

### Khi nào tạo / không tạo Issue
| User Request | Action |
|-------------|--------|
| Fix bug / Thêm feature / Refactor / Chỉnh UI có sửa code | ✅ Tạo issue trước rồi mới code |
| Giải thích code / phân tích / đề xuất approach chưa code | ❌ Không cần issue |

Quy tắc: nếu request dẫn đến sửa bất kỳ file code nào, issue phải tồn tại trước khi thực hiện.

### Tiêu chuẩn tạo Issue
Issue phải gồm:
1. **Clear title** (prefix `Fix:`, `Feat:`, `Refactor:`, `Docs:`)
2. **Description** (what + why)
3. **Technical scope** (files/API/flow bị ảnh hưởng)
4. **Acceptance Criteria** dạng checklist `- [ ] ...`
5. **Dependencies** (`Depends on #...` / `Blocked by #...` nếu có)

Mẫu:
```markdown
## Mô tả
...

## Phạm vi
- API/UI/flow ảnh hưởng

## Acceptance Criteria
- [ ] Deliverable 1 cụ thể, kiểm chứng được
- [ ] Deliverable 2 cụ thể, kiểm chứng được
- [ ] `npm run build` pass
```

### Phase 1: Trước khi code — đọc & hiểu issue
```bash
gh issue view <issue-number>
gh issue list --label "epic:<feature-name>"
```
- Đọc đầy đủ body + checklist + dependency.
- Điểm nào chưa rõ thì hỏi user, không tự giả định.

### Phase 2: Implementation — code & verify
```bash
# Nếu issue thuộc epic
git checkout main
git pull origin main
git checkout epic/<epic-name>
git merge main
git push origin epic/<epic-name>
git checkout -b feature/<issue-number>-short-description

# Nếu issue độc lập
git checkout main
git pull origin main
git checkout -b feature/<issue-number>-short-description
```
- Code theo conventions của repo.
- Verify tối thiểu với `npm run build`; nếu repo có script lint/test phù hợp thì chạy thêm.

### Phase 2.5: Test & Smoke Test (BẮT BUỘC)
1. Lập test plan: happy path / error path / regression.
2. Verify theo loại thay đổi (UI/API/routing/fallback/storage).
3. Smoke test tối thiểu: app chạy được, flow chính hoạt động, không có lỗi nghiêm trọng.
4. Khi bàn giao: nêu lệnh đã chạy + flow đã test + rủi ro còn lại.

**Epic auto-proceed rule**: nếu user yêu cầu triển khai cả epic, agent không cần xin xác nhận giữa từng sub-issue; hoàn tất tuần tự từng issue (code → verify → push → merge epic branch → close issue).

**Standalone issue rule**: dừng sau khi hoàn thành và chờ user xác nhận trước khi commit/push/merge.

### Phase 3: Sau khi user xác nhận — update issue, commit & close
```bash
# 1) Comment implementation summary
gh issue comment <issue-number> --body "## Implementation Summary
...

## Testing
- npm run build ✅
- Manual smoke test ✅"

# 2) Update checklist trong issue body
gh issue view <issue-number> --json body -q '.body'
gh issue edit <issue-number> --body "<updated body with [x] checks>"

# 3) Stage đúng file
git add <specific-files>

# 4) Commit
git commit -m "feat(#<issue-number>): short description"

# 5) Push branch
git push origin feature/<issue-number>-short-description

# 6) Merge target
# - Issue thuộc epic: merge vào epic/<epic-name>
# - Issue độc lập: merge vào main

# 7) Close issue
gh issue close <issue-number>
```

Closing checklist trước khi close:
- [ ] Có implementation summary comment
- [ ] Acceptance Criteria đã check `[x]`
- [ ] Commit có issue number
- [ ] Branch đã push
- [ ] Đã merge đúng target branch

## GitHub CLI (`gh`) Commands Reference
Luôn ưu tiên `gh` CLI:

| Action | Command |
|--------|---------|
| View issue | `gh issue view <number>` |
| List issues by label | `gh issue list --label "epic:<feature-name>"` |
| Comment on issue | `gh issue comment <number> --body "message"` |
| Close issue | `gh issue close <number>` |
| Create issue | `gh issue create --title "..." --label "..." --body "..."` |
| Edit issue body | `gh issue edit <number> --body "..."` |
| Add label | `gh issue edit <number> --add-label "label-name"` |
| List labels | `gh label list` |
| Create label | `gh label create "name" --description "..." --color "hex"` |
| View PR | `gh pr view <number>` |
| Create PR | `gh pr create --title "..." --body "..." --base main` |

## Checklist Update Pattern
```bash
gh issue view <number> --json body -q '.body'
gh issue edit <number> --body "<updated body with [x] checks>"
```

## Multi-Issue Workflow
1. Liệt kê issues của epic: `gh issue list --label "epic:<feature-name>"`.
2. Làm theo thứ tự dependency.
3. Hoàn thành trọn vẹn từng issue trước khi chuyển issue kế tiếp.
4. Reference dependencies trong issue/PR comments (`Depends on #...`).

## Epic Branching Strategy (BẮT BUỘC)
Sub-issue branch không merge trực tiếp vào `main`; phải đi qua `epic/<epic-name>`.

```
main
 └── epic/<epic-name>
      ├── feature/<issue>-description
      ├── fix/<issue>-description
      └── ...
```

1. Bắt đầu epic: tạo `epic/<epic-name>` từ `main` và push.
2. Bắt đầu sub-issue: luôn sync epic branch với `main`, rồi tạo branch con từ epic branch.
3. Hoàn thành sub-issue: merge branch con vào epic branch, sau đó close sub-issue.
4. Chỉ khi user duyệt epic hoàn tất mới merge `epic/<epic-name>` vào `main`.
5. Sau khi epic merge xong: dọn worktree các sub-issues đã hoàn tất.

## Testing & Verification (điều chỉnh theo repo này)
Repo hiện **không có script `npm run lint` mặc định**; vì vậy trước khi báo xong:

1. Chạy `npm run build` cho mọi thay đổi code đáng kể.
2. Chạy smoke test tối thiểu bằng `npm run dev`:
   - Dashboard mở được (`/dashboard`)
   - Endpoint model list hoạt động (`GET /v1/models` hoặc API tương đương)
   - Flow liên quan thay đổi hoạt động, không có lỗi nghiêm trọng ở terminal
3. Nếu thay đổi API routing/translation/fallback, verify thêm:
   - `POST /v1/chat/completions` (stream hoặc non-stream theo phạm vi sửa)
   - Trường hợp fallback/account unavailable nếu bị ảnh hưởng
4. Báo cáo bàn giao ngắn gọn:
   - Lệnh đã chạy
   - Flow đã test
   - Rủi ro còn lại (nếu có)

## Hướng dẫn sửa theo phạm vi
- **UI dashboard**: sửa trong `src/app/(dashboard)/**` + shared components liên quan.
- **API management**: sửa trong `src/app/api/**` đúng domain (providers, settings, usage, keys...).
- **Compatibility `/v1/*`**: ưu tiên đọc route + `src/sse/**` + `open-sse/**` trước khi chỉnh.
- **Auth/guard**: kiểm tra `src/proxy.js`, `src/dashboardGuard.js`, `src/app/api/auth/**`.
- **Cloud sync**: kiểm tra `src/app/api/sync/**` + `src/shared/services/cloudSyncScheduler.js`.

## Những điều không làm nếu chưa có yêu cầu
- Không đổi port/runtime defaults trừ khi task yêu cầu.
- Không refactor diện rộng thư mục `open-sse` khi chỉ cần fix cục bộ.
- Không thay đổi format dữ liệu DB (`db.json`, `usage.json`) nếu không có migration rõ ràng.

## Tài liệu tham chiếu ưu tiên
1. `docs/ARCHITECTURE.md`
2. `README.md` (section Environment Variables, API Reference, Troubleshooting)
3. `wt.sh` (workflow worktree thực tế của repo)
