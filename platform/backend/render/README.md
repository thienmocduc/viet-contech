# Render Farm Orchestrator — Viet-Contech AI Design Platform

Auto render **9 phong cách × 8 góc/phòng + 360° walkthrough** qua Zeni Cloud Lớp 03 `sd-lora-interior`.

Mirror agent `render_3d` trong `agents/registry.json` (B10-render phase).

## Architecture

```
                   +---------------------+
   POST API   -->  |    RenderFarm       | --> JobRegistry (progress)
                   +---------------------+
                          |
            +-------------+--------------+
            |             |              |
       PromptBuilder  ZeniL3Client   StorageAdapter
       (9 styles)    (sd-lora-int)   (local | Zeni L2)
            |             |              |
       prompt+neg     image bytes    PNG/GLB/USDZ
```

## Setup

```bash
cd platform/backend/render
npm install
npm run typecheck
npm test          # mock mode, ~10s
```

## ENV

```bash
ZENI_L3_TOKEN=...            # leave blank → mock mode
ZENI_L3_ENDPOINT=https://zenicloud.io/api/v1/router/route
ZENI_WORKSPACE=vietcontech
ZENI_L2_TOKEN=...            # production storage
ZENI_L2_BUCKET=vietcontech-projects
```

## Cost tier (sd-lora-interior @ $0.04/img preview, $0.08/img production)

| Project size | Rooms | Frames preview | USD | VND |
|---|---|---|---|---|
| 1 room 1 style 8 angles | 1 | 8 | $0.32 | 7,840 |
| 80m² 1 room 9 styles | 1 | 72 | $2.88 | 70,560 |
| 80m² 1 room 9 styles + 360 | 1 | 78 | $3.12 | 76,440 |
| **280m² 6 rooms 9 styles** | 6 | **432** | **$17.28** | **423,360** |
| 280m² 6 rooms 9 styles + 6×360 | 6 | 468 | $18.72 | 458,640 |
| Production 4K (×2 cost) 280m² | 6 | 432 | $34.56 | 846,720 |

360° walkthrough riêng: 6 cubemap face × $0.04 = **$0.24/scene** (5,880 VND).

## API

| Method | Path | Body / Query |
|---|---|---|
| POST | `/api/render/room` | `{projectId, roomType, style, cung_menh, num_angles?, quality?}` |
| POST | `/api/render/all-styles` | `{projectId, roomType, cung_menh, num_angles?, quality?}` |
| POST | `/api/render/360` | `{projectId, roomType, style, cung_menh, quality?}` |
| GET | `/api/render/job/:id` | — |
| GET | `/api/render/results/:projectId` | — |
| GET | `/api/render/cost-estimate` | `?num_rooms=6&num_styles=9&num_angles=8&quality=preview&include_360=true` |

## File output (LocalStorageAdapter mặc định)

```
data/renders/{projectId}/{style}/
   living-front.png
   living-back.png
   living-left.png
   ...8 angles
   panorama-panorama.png       (360 only)
   panorama-panorama.glb       (Web/Quest VR)
   panorama-panorama.usdz      (iOS AR Quick Look)
```

Production: ZeniL2StorageAdapter → `vietcontech-projects/{projectId}/03-3d/{style}/...`

## Files

| File | Trách nhiệm |
|---|---|
| `src/types.ts` | Types: 9 styles, 7 rooms, 8 angles, cung mệnh, quality |
| `src/prompt-builder.ts` | 9 STYLE_PROMPTS DNA + room + angle + ngũ hành colors |
| `src/zeni-l3-client.ts` | Client `sd-lora-interior` (mock + real) |
| `src/storage.ts` | `LocalStorageAdapter` + `ZeniL2StorageAdapter` |
| `src/queue.ts` | `runPool` parallel-5 retry-3 + `JobRegistry` progress |
| `src/render-farm.ts` | `RenderFarm.renderRoom / renderAll9Styles / render360` |
| `src/walkthrough-360.ts` | 360 helpers + cost estimator + validation |
| `src/api.ts` | Hono routes |
| `tests/test-render.ts` | E2E mock |

## Hard constraints (theo agent DNA)

- KHÔNG render người trong cảnh
- KHÔNG render logo thương hiệu
- Watermark VCT bắt buộc 30% opacity, góc dưới phải
- Resolution tối thiểu 2048×1536 (production)
- Negative prompt cố định cho mọi style

## Roadmap

- [ ] Sharp-based real cubemap → equirectangular stitch
- [ ] glTF-Transform real GLB pack với panorama texture
- [ ] BullMQ + Redis queue cho production scale
- [ ] Kết nối với BIM module (đọc DXF/IFC làm conditioning input)
- [ ] Day/night mode (2 lần render mỗi angle)
