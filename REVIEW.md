## Review
- Summary: Added CI workflow for Rust checks and doctor/patient web builds.
- Tests: `cargo check -p gdgoc -p shared`

## Review (2026-03-15)
- Summary: Switched deployment workflow to Cloud Run and aligned README backend references accordingly.
- Tests: Not run (CI deploy change only).

## Review (2026-03-15)
- Summary: Updated system architecture diagram label from Cloud Functions to Cloud Run.
- Tests: Not run (diagram update only).

## Review (2026-03-15)
- Summary: Added SERVICE_ACCOUNT_EMAIL to Cloud Run deploy env vars to prevent startup failure.
- Tests: Not run (CI deploy change only).

## Review (2026-03-17)
- Summary: Added shared design-system assets for the doctor UI, including tokens/base styles and reusable Button/Modal modules, and aligned the existing doctor styles with the new design tokens.
- Tests: `cmd /c npx tsc --noEmit` in `doctor` passed. `cmd /c npm run build` reached Vite/esbuild startup but failed in this environment with `spawn EPERM`.

## Review (2026-03-17, design system refinement)
- Summary: Refined the shared design-system implementation after spec review by adding layout/focus tokens, heading base styles, button metadata helpers, and modal scroll/focus handling plus a D-05 end-session modal factory.
- Tests: `cmd /c npx tsc --noEmit` in `doctor` passed.

## Review (2026-03-17, specification docs)
- Summary: Added final decision-ready UI and design-system development specifications under `docs/` so implementation and review can refer to repo-tracked source documents.
- Tests: Not run (documentation update only).

## Review (2026-03-17, D-05 step-by-step implementation)
- Summary: Implemented the first-pass D-05 build artifacts in order (tokens/base, shared Button/Modal, doctor mocks/state/components/styles/page) and integrated D-05 as a new doctor app entry path via the sidebar.
- Tests: `cmd /c npx tsc --noEmit` in `doctor` passed.

## Review (2026-03-17, mock data alignment)
- Summary: Updated `sampleDocumentHtml.ts` and `doctorMainMock.ts` to match the newly provided docx mock-data drafts while keeping backward-compatible exports for the current D-05 mock page.
- Tests: `cmd /c npx tsc --noEmit` in `doctor` passed.

## Review (2026-03-17, D-05 viewer and marker layout fixes)
- Summary: Updated D-05 so only the document viewport scrolls, attention markers are overlaid inside the viewer and positioned by `sectionId` targets, end-session button text was changed to `説明終了の同意確認へ`, and right-side explanation cards now have wider spacing.
- Tests: `cmd /c npx tsc --noEmit` in `doctor` passed.

## Review (2026-03-17, D-05 layout rebalance and modal readability)
- Summary: Rebalanced D-05 layout to prioritize the document viewer (narrower status panel), aligned D-05 top/bottom edges by removing vertical page padding, added current time to SessionMeta on header-right, and improved end-session modal readability (centered title/intro, emphasized checklist, left-cancel/right-confirm actions).
- Tests: `cmd /c npx tsc --noEmit` in `doctor` passed.

## Review (2026-03-17, D-05 top/bottom flush and outer-scroll cleanup)
- Summary: Applied D-05-only container mode so the layout has no outer top/bottom padding, TopHeader sits at the layout top edge, BottomActionBar sits at the bottom edge, outer right-page scrolling is removed, and the status panel now scrolls internally only when content overflows.
- Tests: `cmd /c npx tsc --noEmit` in `doctor` passed. `cmd /c npm run -s build` failed in this environment with `spawn EPERM`.

## Review (2026-03-17, end-session modal checklist centering)
- Summary: Updated the end-session modal checklist so each item is explicitly rendered with a leading `・` and centered directly under the intro text, removing default list indentation dependency.
- Tests: `cmd /c npx tsc --noEmit` in `doctor` passed.
