import {createTaskModal} from './settings/task-modal.js';
// Verdant v1.5.3 Vue 3 presentation layer. The DB/ZIP/map engines remain plain JS.
// Bundled Vue is the local, compiler-included production build (no CDN at runtime).
const { createApp, defineComponent, reactive, ref, computed, watch } = window.Vue || {};

const PlantCard = defineComponent({
  name: 'PlantCard',
  props: {card: {type:Object,required:true}},
  template: `<article class="plant-card" :data-open-marker="card.id" role="button" tabindex="0">
    <img v-if="card.photoId" class="plant-thumb" :data-image-id="card.photoId" alt="Plant photo" loading="lazy">
    <div v-else class="plant-thumb blank">✳</div>
    <div class="plant-card-body"><h3><span class="plant-type-dot" :style="{background:card.color}"></span>{{card.name}}</h3>
      <p>{{card.scientific}}</p><a v-if="card.reference" class="reference-link" :href="card.reference" target="_blank" rel="noopener noreferrer">Open species reference ↗</a>
      <div class="plant-card-footer"><span class="state-tag" :class="{removed:card.removed,dead:!card.alive&&!card.removed}">{{card.removed?'○ Removed':card.alive?'● Living':'● Dead'}}</span>
      <small>{{card.journalCount}} journal entries</small></div></div></article>`
});

const PlantTypeCard = defineComponent({
  name: 'PlantTypeCard',
  props: {card: {type:Object,required:true}},
  template: `<article class="type-card"><div class="type-icon" :style="{'--type-color':card.color}">❀</div>
    <h3>{{card.name}}</h3><p class="scientific">{{card.scientific}}</p><p v-if="card.taxonomy" class="taxonline">{{card.taxonomy}}</p><p class="langline">{{card.languages}}</p>
    <div class="type-link"><a v-if="card.reference" class="reference-link" :href="card.reference" target="_blank" rel="noopener noreferrer">Open species reference ↗</a></div>
    <footer><button type="button" class="type-count-button" data-action="show-type-on-map" :data-id="card.id" :aria-label="'Show '+card.count+' '+(card.count===1?'plant':'plants')+' of '+card.name+' on map'">{{card.count}} {{card.count===1?'plant':'plants'}} <span aria-hidden="true">↗</span></button>
      <button class="btn btn-outline btn-small" data-action="edit-type" :data-id="card.id">Edit type →</button></footer></article>`
});

// One searchable taxonomy tree serves multi-select filters and the plant editor.
// Search affects visibility only; ticking a family/genus always changes ALL of
// its descendants, including leaves temporarily hidden by a search query.
const TaxonomyTreeFilter=defineComponent({
  name:'TaxonomyTreeFilter',
  props:{tree:{type:Array,required:true},selected:{type:Array,required:true},active:{type:Boolean,default:false},mode:{type:String,default:'filter'}},
  emits:['selection-change','reset-filter'],
  setup(props,{emit}){
    const search=ref('');
    const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
    const visibleTree=computed(()=>{
      const query=normalized(search.value.trim());
      if(!query)return props.tree;
      return props.tree.map(f=>{
        if(normalized(f.label)===query)return f;
        const genera=f.genera.map(g=>{
          if(normalized(g.label).includes(query))return g;
          const types=g.types.filter(t=>normalized([t.label,t.scientific,t.searchText].join(' ')).includes(query));
          return types.length?{...g,types}:null;
        }).filter(Boolean);
        // Prefer precise genus/species matches over a broad family substring
        // (e.g. "Olea" should not expand the entire "Oleaceae" family).
        return genera.length?{...f,genera}:normalized(f.label).includes(query)?f:null;
      }).filter(Boolean);
    });
    const matches=computed(()=>visibleTree.value.reduce((total,f)=>total+f.genera.reduce((n,g)=>n+g.types.length,0),0));
    const selectedSet=()=>new Set(props.selected);
    // Resolve parent IDs against the UNFILTERED tree so search does not change
    // recursive selection semantics.
    const familyIds=f=>props.tree.find(item=>item.key===f.key)?.genera.flatMap(g=>g.types.map(t=>t.id))||[];
    const genusIds=g=>props.tree.flatMap(f=>f.genera).find(item=>item.key===g.key)?.types.map(t=>t.id)||[];
    const checked=ids=>ids.length>0&&ids.every(id=>selectedSet().has(id));
    const partial=ids=>!checked(ids)&&ids.some(id=>selectedSet().has(id));
    const toggle=(ids,enabled)=>{const next=selectedSet();for(const id of ids){if(enabled)next.add(id);else next.delete(id);}emit('selection-change',[...next]);};
    const chooseSpecies=id=>emit('selection-change',[id]);
    const clear=()=>emit('reset-filter');
    return {search,visibleTree,matches,familyIds,genusIds,checked,partial,toggle,chooseSpecies,clear};
  },
  template:`<div class="taxonomy-tree" :aria-label="mode==='plant'?'Choose a plant species':'Family, genus and species filters'">
    <div class="tree-toolbar">
      <span>{{mode==='plant' ? (selected.length?'Species selected':'No species selected') : (!active?'All plant types':selected.length?selected.length+' selected':'No plant types selected')}}</span>
      <button type="button" class="btn btn-quiet btn-small" @click="clear">{{mode==='plant'?'No type':'Show all'}}</button>
    </div>
    <div class="tree-search-row"><input id="taxonomyTreeSearch" type="search" v-model="search" autocomplete="off" spellcheck="false" aria-label="Search families, genera, species and common names" placeholder="Search family, genus, species or common name…"><small aria-live="polite">{{matches}} matching {{matches===1?'species':'species'}}</small></div>
    <div class="tree-scroll">
      <label v-if="mode!=='plant' && !search" class="tree-check tree-unassigned"><input type="checkbox" :checked="selected.includes('unassigned')" @change="toggle(['unassigned'],$event.target.checked)"><span>Unassigned plants</span></label>
      <details v-for="family in visibleTree" :key="family.key+(search?'#search':'')" class="tree-family" open>
        <summary><label v-if="mode!=='plant'" class="tree-check tree-family-label" @click.stop><input type="checkbox" :checked="checked(familyIds(family))" :indeterminate="partial(familyIds(family))" @click.stop @change="toggle(familyIds(family),$event.target.checked)"><span>{{family.label}}</span></label><strong v-else class="tree-heading">{{family.label}}</strong><small>{{familyIds(family).length}}</small></summary>
        <details v-for="genus in family.genera" :key="genus.key+(search?'#search':'')" class="tree-genus" open>
          <summary><label v-if="mode!=='plant'" class="tree-check tree-genus-label" @click.stop><input type="checkbox" :checked="checked(genusIds(genus))" :indeterminate="partial(genusIds(genus))" @click.stop @change="toggle(genusIds(genus),$event.target.checked)"><span>{{genus.label}}</span></label><strong v-else class="tree-heading">{{genus.label}}</strong><small>{{genusIds(genus).length}}</small></summary>
          <div class="tree-species"><label v-for="type in genus.types" :key="type.id" class="tree-check"><input v-if="mode==='plant'" type="radio" name="plant-species-choice" :checked="selected.includes(type.id)" @change="chooseSpecies(type.id)"><input v-else type="checkbox" :checked="selected.includes(type.id)" @change="toggle([type.id],$event.target.checked)"><span>{{type.label}}<small v-if="type.scientific && type.scientific!==type.label">{{type.scientific}}</small></span></label></div>
        </details>
      </details>
      <p v-if="!matches" class="hint">No matching plant types. Try another search.</p>
    </div>
  </div>`
});

export function mountGarden() {
  if (!createApp) throw new Error('Local Vue 3 runtime missing. No garden data was changed.');
  const ui=reactive({tab:'map',plantCount:0,gardenTitle:'My garden',mapPresent:false,plantCards:[],typeCards:[],typeCount:0,taxonTree:[],selectedTaxonIds:[],taxonFilterActive:false,taxonModalOpen:false,taxonDraft:[],taxonDraftActive:false,taxonMode:'filter',managementTool:null});
  createApp({name:'VerdantApp',components:{PlantCard,PlantTypeCard,TaxonomyTreeFilter},setup(){
    // A single modal serves both map and inventory; edits remain local until Apply.
    // Cancel and tapping the backdrop never modify the active garden filters.
    let previouslyFocused=null;
    let plantPickerTarget=null;
    ui.openTaxonomyModal=(mode='filter',target=null)=>{
      ui.taxonMode=mode;
      plantPickerTarget=mode==='plant'?target:null;
      const mapMenu=document.getElementById('mapFilterMenu');
      previouslyFocused=mapMenu?.contains(document.activeElement)
        ? mapMenu.querySelector('summary') : document.activeElement;
      ui.taxonDraft=mode==='plant'?(target?.value?[target.value]:[]):[...ui.selectedTaxonIds];
      ui.taxonDraftActive=mode==='plant'?!!target?.value:ui.taxonFilterActive;
      if(mapMenu)mapMenu.open=false;
      ui.taxonModalOpen=true;
      document.body.classList.add('taxonomy-dialog-open');
      window.Vue.nextTick(()=>document.getElementById('taxonomyTreeSearch')?.focus({preventScroll:true}));
    };
    ui.openPlantTypeModal=target=>ui.openTaxonomyModal('plant',target);
    ui.cancelTaxonomyModal=()=>{
      ui.taxonModalOpen=false;
      document.body.classList.remove('taxonomy-dialog-open');
      plantPickerTarget=null;
      window.Vue.nextTick(()=>previouslyFocused?.isConnected&&previouslyFocused.focus({preventScroll:true}));
    };
    ui.onTaxonomyChange=ids=>{ui.taxonDraft=ui.taxonMode==='plant'?ids.slice(0,1):[...ids];ui.taxonDraftActive=true;};
    ui.onTaxonomyReset=()=>{ui.taxonDraft=[];ui.taxonDraftActive=false;};
    ui.applyTaxonomyModal=()=>{
      if(ui.taxonMode==='plant'){
        const target=plantPickerTarget;
        if(target?.isConnected){
          const id=ui.taxonDraft[0]||'';
          target.value=id;
          const treeType=ui.taxonTree.flatMap(f=>f.genera.flatMap(g=>g.types)).find(t=>t.id===id);
          const label=target.closest('.type-picker')?.querySelector('.type-picker-current');
          if(label)label.textContent=treeType?.label||'— No type yet —';
          target.dispatchEvent(new Event('change',{bubbles:true}));
        }
        ui.cancelTaxonomyModal();return;
      }
      if(ui.taxonDraftActive)window.VerdantTaxonomyFilterChange?.([...ui.taxonDraft]);
      else window.VerdantTaxonomyFilterReset?.();
      ui.cancelTaxonomyModal();
    };
    ui.onTaxonomyModalKeydown=e=>{
      if(e.key==='Escape'){e.stopPropagation();e.preventDefault();ui.cancelTaxonomyModal();return;}
      if(e.key!=='Tab')return;
      const dialog=document.getElementById('taxonomyModal');
      const nodes=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
        .filter(el=>el.getClientRects().length>0);
      if(!nodes.length)return;
      const first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}
    };
    // Inline backup controls live in Settings. Opening Settings still unloads
    // the map/gallery in app.js; the backup engine is imported only here.
    let cleanupBackup=null,backupGeneration=0;
    watch(()=>ui.tab,async(tab)=>{
      const generation=++backupGeneration;
      cleanupBackup?.();cleanupBackup=null;
      if(tab!=='settings')return;
      try{
        const {mountBackup}=await import('./settings/backup-tool.js');
        if(generation!==backupGeneration||ui.tab!=='settings')return;
        const root=document.getElementById('page-settings');
        if(root)cleanupBackup=mountBackup(root,{onRestore:()=>window.location.reload()});
      }catch(error){
        if(generation!==backupGeneration)return;
        const modal=createTaskModal({title:'Backup tools unavailable'});
        modal.report('Could not load backup tools: '+(error.message||error));modal.finish({label:'Close'});
      }
    },{flush:'post'});
    let cleanupTool=null;
    ui.openManagement=async(kind)=>{
      if(window.VerdantManagementBusy)return;
      if(kind==='backup'){
        document.getElementById('settingsBackupCard')?.scrollIntoView({block:'center',behavior:'smooth'});
        return;
      }
      if(ui.managementTool || kind!=='photos')return;
      ui.managementTool=kind;
      await window.Vue.nextTick();
      const root=document.getElementById('settingsManagementRoot');
      if(!root)return;
      try{const {mountManagement}=await import('./settings/manager.js');cleanupTool=await mountManagement(root,kind);}
      catch(err){root.textContent='Could not open tool: '+(err.message||err);}
    };
    ui.closeManagement=()=>{
      if(window.VerdantManagementBusy){alert('Finish or pause the current operation before leaving Settings.');return;}
      cleanupTool?.();cleanupTool=null;
      ui.managementTool=null;
    };
    ui.prepareReset=()=>{
      // Prevent an in-flight module import from mounting another database tool.
      backupGeneration++;
      cleanupBackup?.();cleanupBackup=null;
      cleanupTool?.();cleanupTool=null;
      ui.managementTool=null;
    };
    return ui;
  }}).mount('#app');
  window.VerdantUI=ui;
  return ui;
}
