/* Verdant taxonomy helpers. No naming guesses, network, or side effects.
   `species` is the FULL species/scientific name used by the gardener.
   `scientificName` remains present for backward compatibility and backup format 2.
   `genus` / `family` are optional: only manual input or Pl@ntNet fields supply them. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VerdantTaxonomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const UNKNOWN = '__unknown__';
  const fields = ['family', 'genus', 'species'];
  const normalize = value => String(value == null ? '' : value).trim();
  const searchable = value => normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  // Pl@ntNet returns genus/family as plain strings in project species search,
  // or as taxon objects in identification results. Never parse the species name
  // to invent the other taxa.
  function taxonName(value) {
    if (typeof value === 'string') return normalize(value);
    if (value && typeof value === 'object')
      return normalize(value.scientificNameWithoutAuthor || value.scientificName || '');
    return '';
  }
  function fromPlantNetSpecies(record) {
    if (!record || typeof record !== 'object') return {scientificName:'',species:'',genus:'',family:''};
    const scientificName = normalize(record.scientificNameWithoutAuthor || record.scientificName || '');
    return {scientificName, species:scientificName, genus:taxonName(record.genus), family:taxonName(record.family)};
  }
  // v1.5.3/1.5.4 stored a *specific epithet* automatically in species. Repair
  // only that exact legacy pattern. Never overwrite distinct gardener-entered
  // species values, and never change a previously filled-in genus or family.
  function isLegacyEpithet(scientificName, species) {
    const name = normalize(scientificName), value = normalize(species);
    const match = /^([A-Z][a-z-]+)\s+([a-z][a-z-]*)(?:\s|$)/.exec(name);
    return !!(match && value && value === match[2] && name !== value);
  }
  function migrateType(type) {
    const copy = {...type};
    if (typeof copy.family !== 'string') copy.family = '';
    if (typeof copy.genus !== 'string') copy.genus = '';
    if (typeof copy.species !== 'string' || !normalize(copy.species) || isLegacyEpithet(copy.scientificName, copy.species))
      copy.species = normalize(copy.scientificName);
    return copy;
  }
  const groupKey = (type,field) => normalize(type?.[field]) || UNKNOWN;
  const taxonQuery = type => [type?.nameEn,type?.nameEs,type?.nameDe,type?.scientificName,...fields.map(f=>type?.[f])].join(' ');
  function matches(type, selected) {
    return ['family','genus'].every(key => !(selected[key]||[]).length || (type && selected[key].includes(groupKey(type,key)))) &&
      (!(selected.types||[]).length || selected.types.includes(type?.id || 'unassigned'));
  }
  function groupTypes(types) {
    const groups=new Map();
    for (const type of types) {
      const family=normalize(type.family)||'Family unknown';
      const genus=normalize(type.genus)||'Genus unknown';
      const key=family+'\u0000'+genus;
      if (!groups.has(key)) groups.set(key,{key,family,genus,types:[]});
      groups.get(key).types.push(type);
    }
    return [...groups.values()].sort((a,b)=>(a.family+' '+a.genus).localeCompare(b.family+' '+b.genus));
  }
  function buildFilterTree(types, labelFn=(t=>t.nameEn||t.scientificName||t.species||'Unnamed species')) {
    const families=new Map();
    for (const t of types) {
      const fam=normalize(t.family)||'Family unknown';
      const gen=normalize(t.genus)||'Genus unknown';
      if(!families.has(fam))families.set(fam,new Map());
      const genera=families.get(fam);
      if(!genera.has(gen))genera.set(gen,[]);
      genera.get(gen).push({id:t.id,label:labelFn(t),scientific:t.species||t.scientificName||'',searchText:[t.nameEn,t.nameEs,t.nameDe,t.scientificName,t.species].join(' ')});
    }
    const sort=(a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'});
    return [...families.entries()].sort((a,b)=>sort(a[0],b[0])).map(([family,genusMap])=>({
      key:family,label:family,
      genera:[...genusMap.entries()].sort((a,b)=>sort(a[0],b[0])).map(([genus,species])=>({
        key:family+'\u0000'+genus,label:genus,types:species.sort((a,b)=>sort(a.label,b.label))
      }))
    }));
  }
  return {UNKNOWN, fields, normalize, searchable, taxonName, fromPlantNetSpecies, isLegacyEpithet, migrateType, groupKey, taxonQuery, matches, groupTypes, buildFilterTree};
});
