# Garden Inventory PWA — Development Specification

## Tech Stack & Architecture Requirements

Build a minimal, offline-first Progressive Web App (PWA) that runs locally on Android and desktop browsers, without a backend, cloud storage, or permanent hosting.

### Tech Stack

- Frontend: Vanilla HTML, CSS, JavaScript (no frameworks, npm, or build process).
- App structure: Keep everything as simple as possible, ideally one `index.html` containing HTML, CSS, and JS, plus the necessary PWA files.
- PWA: `manifest.json`, Service Worker (`sw.js`), and app icons.
- Offline support: Service Worker caches all application assets so the app works completely offline after installation and successful initial caching.
- Local database: IndexedDB for structured records and attached images (stored as Blobs).
- Data export/import: Initially a JSON backup containing all records, the map image, and attached images (images encoded as Base64). Support restoring from backup. ZIP archives with separate images may be introduced later, without changing the underlying database model.
- UI: Mobile-first, responsive design, optimized for Android touchscreens but also usable on desktop.
- Dependencies: Prefer zero external dependencies and no CDNs.

### Installation & Distribution

The app must work without external hosting:

1. Copy the PWA files onto an Android device.
2. Start a local HTTP server using Termux:

   ```sh
   pkg install python
   cd ~/storage/downloads/my-app
   python -m http.server 8080 --bind 127.0.0.1
   ```

3. Open `http://127.0.0.1:8080/` in the Android browser.
4. Install/add the PWA to the home screen.
5. Stop the local HTTP server. The installed app should continue working completely offline through its Service Worker, assuming its assets have been successfully cached.

`localhost` / `127.0.0.1` are treated as secure contexts, so HTTPS is not required for this setup.

Updating the installed app's files may require starting the local HTTP server again. Use the same local origin (scheme, host, and port) consistently, since different origins have separate browser storage and Service Worker registrations.

### Confirmed Working

We built and tested a minimal example PWA using this architecture.

- Localhost-based PWA setup works on Android.
- The app works offline without a permanently running HTTP server.
- IndexedDB works for locally storing app data and images.
- Firefox Android grants persistent storage.
- Chrome Android did not grant persistent-storage permission, but the app generally worked.
- JSON export/import is included in the prototype.

Important: IndexedDB data can persist without an explicit persistent-storage grant, but browser storage can still be cleared or evicted. Backups are essential.

### Development Guidelines

- Keep the codebase small, readable, and maintainable.
- No backend, authentication, server-side database, or external APIs unless explicitly requested (Pl@ntNet is the explicitly permitted optional online API).
- All user inventory data remains on the device; photos sent for identification go directly to Pl@ntNet only when the user initiates an online identification.
- Store images as Blobs in IndexedDB, not in localStorage.
- Implement reliable backup/restore, including attachments and the map image.
- Design for offline usage from the beginning.
- Preserve backward compatibility with existing saved data when updating the app.
- Keep the PWA installable using the same localhost workflow.
- Avoid unnecessary dependencies and complexity.
- Use stable unique IDs (preferably `crypto.randomUUID()`) for records and references, preserving them through backup, restore, and upgrades.
- Keep database operations, map logic, plant identification, and backup/restore code organized into understandable sections, even if the main app stays in one HTML file.

## App Functionality

The app should track the inventory of a big garden of trees and other plants. I want it to be a map (a screenshot of a map; we might later have a more symbolic map overlay, but to get the geometry right we will initially use a screenshot of a satellite image of the place) where I can add markers for each plant.

The initial map will be a **north-up, directly overhead satellite screenshot without tilt or rotation**. It is a static image stored locally, not a live map service.

### Each Marker Should Hold This Information

- **Status of the Plant** (timestamped information about the plant; like a diary of each plant):
  - Photo/image of the plant.
  - Textual description/note.
  - Optional change of whether it is alive or dead (initial default: alive).
  - Optional change of whether the plant is removed (it might be dead but still there; initial default: not removed).
  - Optional rating of how well the plant does (1–10).
- **Plant Type:**
  - Spanish, English, and German name.
  - Scientific name where known (canonical species reference).
  - Set of links (including to the Pl@ntNet entry).

For each plant instance in the garden, we can assign it to one plant type. Since there are a lot of plants of the same type, we will build a set of plant types that is also offered as a selection when creating a new marker.

A marker does not need to have a type or status entries, can have at most one type, and can have multiple status entries. A marker may also have an optional individual nickname to distinguish it from others of the same type.

After an initial testing phase I want to use the app in production as soon as possible, while still being able to develop it further and import data from previous versions without losing it. Worst case we could write transformation scripts, but I want to avoid that.

I think the data model is extensible; the main types **Marker, Status, Plant Type** should probably stay, even if their attributes get extended. Plant types should have unique IDs that markers refer to. Status entries can be stored as a list inside each marker entry.

Status entries should record **optional changes**, not reset all fields on every entry. For example, a photo-only diary entry must not change a plant from dead back to alive. On marker creation the effective starting state is `alive = true`, `removed = false`, `rating = null`. A missing or null field in a later status entry means **unchanged**, not the default. The current state can be calculated by applying entries in timestamp order. Every entry should have a stable ID and timestamp; allow editing or removing entries.

Images should be stored as separate Blob records in IndexedDB with unique IDs; status entries reference the relevant image ID(s). This supports multiple photos in the future while keeping entries lightweight.

It should be easy to place and reposition markers on the map. It makes sense to filter out removed plants from the map overview by default, with an option to show them again.

Tapping a marker opens its plant type and journal entries (most recent first). You can then edit its type, add/remove/edit status entries, reposition the marker, or delete the marker. When deleting, clearly explain that **if the plant was physically removed, the correct action is to change its status to removed**, not delete the marker. This keeps its history.

### Map Coordinates and Calibration

- Store each marker's permanent position as **WGS84 latitude and longitude**, rather than image pixel coordinates.
- Store calibration information with the map image, independently from markers.
- The user supplies known GPS coordinates for reference points and taps their corresponding locations on the satellite screenshot.
- For the initial north-up, unrotated, approximately constant-scale screenshot, use two sufficiently separated reference points to establish positioning and scale; allow a third point to verify calibration. Account for the difference between latitude and longitude scales at the garden's latitude. If calibration accuracy is insufficient, improve the reference points rather than silently moving saved markers.
- Convert between stored geographic coordinates and image positions to render markers and save placements. GPS positions remain unchanged when replacing the background image; a replacement image needs its own calibration.
- The initial version supports one garden map. Later versions may support replacement map images, symbolic overlays, or multiple maps.
- On Android, marker placement and repositioning can use a **fixed central crosshair**: the user pans and zooms the map underneath the crosshair, then confirms the location. Support familiar desktop controls as appropriate.
- Support pinch-to-zoom and dragging/panning on touchscreens; support practical mouse controls on desktop. Avoid unintended marker movement while panning.
- Do not require the phone's own GPS sensor. Locations are derived from the map calibration and user placement.

### Suggested Minimal IndexedDB Structure

- `markers`: plant instances, stable IDs, geographic coordinates, optional plant type ID, optional nickname, embedded status entries.
- `plantTypes`: shared species/type records with stable IDs, scientific and common names, reference links.
- `images`: plant photographs and the background map as Blobs, with stable IDs and metadata.
- `settings`: app/map settings, calibration information, and the optional device-local Pl@ntNet API key.

Keep the storage model simple; a separate status-entry object store is not required initially.

### Backup and Compatibility

- Initial backup format: one JSON file with Base64-encoded image and map assets, as in the working prototype.
- Include a simple format identifier, `schemaVersion`, and export timestamp. Do not build a complex migration framework prematurely.
- Backups include the marker records, embedded status entries, plant types, photos, and map/calibration data. **Do not export API keys or other device-specific secrets.**
- Restore behavior for now is **replace**, not merge. Merge import is a possible long-term feature, not part of the MVP.
- Validate the backup and its image/record references before replacing existing data. Do not partially overwrite a working database on invalid import; request confirmation before replacing existing data.
- Keep record IDs stable across backups and upgrades. Add simple, explicit version migrations only when schema changes require them; never silently discard existing data. Reject unsupported newer backup formats without changing existing data.
- Browser storage can be cleared or evicted. Make manual backups easy and prominent. Image resizing and more scalable archive formats can be considered later if needed.

---

## Handover: Plant Identification in the PWA

### 1. Architecture

- Fully client-side, offline-capable PWA.
- Static hosting only — no backend, user accounts, authentication or central database.
- Every installed PWA instance stores its own data and configuration locally.
- Use the Pl@ntNet REST API directly from the browser for online plant identification.
- Identification requires internet access; existing local data remains usable offline.
- Human approval is mandatory before confirming any identification.
- Pl@ntNet reference photos may be shown during identification but need not be retained afterwards. They are not required to display existing inventory records offline.

### 2. Bring Your Own Key (BYOK)

- Each person obtains their own Pl@ntNet API key.
- Provide a Pl@ntNet settings section to:
  - Enter, save, replace and remove the API key.
  - Test the API connection.
  - Display connection and quota status where available.
  - Link to account registration and API key settings.
- Store the key locally on the device, using the PWA's existing persistent storage architecture, preferably IndexedDB.
- Never embed a shared developer key in the application.
- Never include keys in application exports, logs or analytics.
- Local browser storage is not a secure vault; inform users that anyone with access to their browser profile may be able to access the key.
- Important Pl@ntNet setup requirement:
  - Enable "expose my API key" in Pl@ntNet API settings.
  - Add the PWA's origin to Authorized domains according to Pl@ntNet requirements.
  - This enables browser-side API calls through CORS where the origin is accepted.
  - The actual app origin in the current installation workflow is `http://127.0.0.1:8080` (not an HTTPS origin). **Test authorization and an actual request from this exact origin early**, and adjust the setup instructions if necessary. Different hostname/port combinations count as different origins.
  - See: https://my.plantnet.org/doc/getting-started/introduction

### 3. Identification Workflow

1. **Take or upload a photo**
   - Initially support one photograph.
   - Multiple photos can be added later.
   - A photograph may be saved locally even when offline or without an API key.
2. **Identify**
   - Send photo directly to Pl@ntNet using the locally configured key.
   - Retrieve the top three candidate species and their scores.
   - Fetch reference photographs where supported.
3. **Review**
   - Show the original photo and candidate species cards.
   - Each candidate includes:
     - Common name.
     - Scientific name.
     - Identification score.
     - Reference image if available.
     - Link to Pl@ntNet species information.
   - Highlight the best match without automatically confirming it.
4. **Human approval**
   - User explicitly chooses and confirms a species.
   - Alternatively:
     - Select another candidate.
     - Reject all suggestions.
     - Retake the photo and retry.
     - Leave the observation unidentified.
5. **Save locally**
   - Save the photo, confirmed species and relevant identification metadata in existing local PWA storage.
   - Keep API suggestions separate from the human-confirmed species.
   - Allow corrections later.
   - When a species is confirmed, reuse an existing plant type if it represents that species; otherwise create a new plant type and assign it to the marker. Do not modify a shared plant type merely because an individual marker was reidentified.
   - Identification observations can be associated with timestamped marker status entries, while `plantTypeId` records the marker's currently assigned type.

### 4. Multilingual Species Names

- Desired languages: English (`en`), Spanish (`es`), German (`de`).
- Pl@ntNet provides multilingual common names through its API.
- Scientific name is the canonical species reference.
- Retrieve translations where practical and cache locally.
- Missing names should not block identification.
- Multilingual enrichment is secondary to the core MVP.

### 5. UI

- Mobile-first identification screen.
- User's plant photo at the top.
- Three selectable identification candidates with scores and reference images.
- Clear selection state.
- Species details, translations and external links.
- Prominent Confirm identification button.
- None of these / I'm not sure option.
- Avoid presenting identification scores as guaranteed probabilities.
- Show reference-photo attribution where supplied and required; reference images can be discarded after identification.

### 6. API References

- Documentation: https://my-api.plantnet.org/
- OpenAPI specification: https://my-api.plantnet.org/swagger.json
- Identification endpoint: `POST /v2/identify/all`
- Identification documentation: https://my.plantnet.org/doc/api/identify
- Client-side API/CORS setup: https://my.plantnet.org/doc/getting-started/introduction
- API account registration: https://my.plantnet.org/signup
- API key management: https://my.plantnet.org/settings/api-key
- Quota documentation: https://my.plantnet.org/doc/api/quota

Verify exact request parameters and response schemas against the official documentation when implementing the integration. For example, submit a supported image format via `FormData` and request three results. Prefer a lightweight authenticated quota/status request for connection testing when supported. Never cache authenticated API requests in the app Service Worker.

### 7. Error Handling

- Missing key: direct user to setup without losing their photograph.
- Invalid key: allow updating it.
- CORS failure: explain how to authorize the PWA's origin.
- Exhausted quota: display an understandable message.
- Offline: allow saving the photo as unidentified and identifying later.
- No reliable match: offer another photo or an unidentified observation.
- Handle rejected requests without unnecessary automatic retries.

### 8. Implementation Priorities

#### MVP

- Client-side BYOK configuration and persistent local storage.
- Direct Pl@ntNet API integration.
- Camera/photo upload.
- Top three identification suggestions.
- Reference images where available.
- Explicit human confirmation.
- Local saving of confirmed or unidentified observations.
- Basic error and quota handling.

#### Later

- English, Spanish and German enrichment.
- Multiple-photo identification.
- Manual species search.
- Additional botanical reference links.
- Identification correction history (beyond preserving basic identification observations).
- Local species metadata caching.

### Core Principle

**Pl@ntNet suggests; the human decides.**

One-time setup: Configure personal API key and authorize the PWA origin.

Normal workflow: Take photo → Pl@ntNet identification → Compare candidates → Human confirmation → Save locally.

No application backend, no user database, no shared API key.

---

## Recommended Development Sequence

The Pl@ntNet section's MVP list describes the *identification feature MVP*. For the whole application, build in the following order so the core garden inventory can enter production early:

### Phase 1 — Core Offline Inventory

- Local map image upload, GPS-reference calibration, pan/zoom, and marker placement/repositioning.
- Markers, plant types, journal/status entries, photographs and removed-plant filtering.
- IndexedDB storage, basic versioning, complete JSON backup and replace-only restore.
- Service Worker/offline installation and testing on Android and desktop.
- Confirm that existing data survives an app update and a backup/restore cycle.

### Phase 2 — Pl@ntNet Identification

- Verify the actual localhost origin works with Pl@ntNet browser-side authorization **early**, even if the rest of this phase is implemented later.
- BYOK settings, API connection/quota feedback, photo identification, review of three candidates, and explicit human approval.
- Reuse or create plant types and store identification metadata with local observations.
- Save photographs offline when identification cannot run.

### Phase 3 — Later Enhancements

- Multilingual name enrichment, additional identification photographs, manual search, expanded correction history, and local species metadata caching.
- Consider ZIP archives for large backups, richer map overlays, and other features only when needed.

Keep the UI conventional and make sensible implementation defaults where the document does not specify an interaction. Avoid overengineering future scenarios.
