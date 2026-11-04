import {createTaskModal} from './task-modal.js';
// Settings-only UI: zero MapLibre imports; data engines load on demand.
const photoHTML=`<div class="management-head"><h2>Optimize saved photos</h2><p>Reduce storage by compressing existing journal photos one at a time. Map imagery is never compressed.</p></div>
 <div class="management-card"><h3>Photo quality</h3><form id="settingsForm"><div class="photo-setting-fields"><label>Target size (KB)<input id="targetKB" type="number" min="50" max="10000" required></label><label>Maximum edge (px)<input id="maxDimension" type="number" min="480" max="8000" required></label><label>Format<select id="format"><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></label></div><button class="btn btn-outline" type="submit">Save settings</button></form></div>
 <div class="management-card"><h3>Existing photos</h3><p id="counts">Checking images…</p><label class="management-confirm"><input id="backupConfirmed" type="checkbox"> I have downloaded and verified a backup of my garden.</label><div><button class="btn btn-primary" id="start">Optimize existing photos</button> <button class="btn btn-outline" id="pause" disabled>Pause after current photo</button> <button class="btn btn-quiet btn-small" id="inspect">Refresh</button></div><progress id="progress" max="100" value="0"></progress><p class="microcopy">Compression is permanent and cannot recreate lost details. Pausing retains completed changes and can be resumed.</p></div>
 <div id="status" class="management-status" role="status" aria-live="polite">Ready.</div>`;
export async function mountManagement(root,kind){
 root.innerHTML=photoHTML;
 window.VerdantManagementBusy=false;
 try {
  const {mountPhotoOptimizer}=await import('./photo-tool.js');return mountPhotoOptimizer(root);
 } catch(error){const modal=createTaskModal({title:'Settings unavailable'});modal.report('Unable to load management tool: '+error.message);modal.finish({label:'Close'});return ()=>{};}
}
