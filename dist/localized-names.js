/* Pl@ntNet localized common-name resolver. Requests are deliberate, exact-name only,
 * language-specific, and never parse or infer translations. Offline save is unaffected. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.VerdantLocalizedNames=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
  function exactName(records,scientificName){
    const target=clean(scientificName).toLocaleLowerCase();
    const rows=Array.isArray(records)?records:(Array.isArray(records?.results)?records.results:[]);
    const match=rows.find(row=>clean(row?.scientificNameWithoutAuthor||row?.scientificName).toLocaleLowerCase()===target);
    return (Array.isArray(match?.commonNames)?match.commonNames:[]).map(clean).find(Boolean)||'';
  }
  async function fetchName({scientificName,lang,apiKey,fetcher=fetch}){
    if(!['en','es','de'].includes(lang))throw Error('Unsupported requested language');
    if(!clean(scientificName)||!apiKey)return '';
    const params=new URLSearchParams({'prefix':clean(scientificName),'page': '1','pageSize':'25','lang':lang,'api-key':apiKey});
    for (const route of ['v2/projects/k-world-flora/species','v2/species']) {
      const response=await fetcher('https://my-api.plantnet.org/'+route+'?'+params.toString(),{cache:'no-store'});
      // Authorization / rate errors should not trigger redundant fallback calls.
      if(response.status===401||response.status===403||response.status===429)throw Error('Pl@ntNet denied localized name lookup (HTTP '+response.status+')');
      if(!response.ok)continue;
      const value=exactName(await response.json(),scientificName);
      if(value)return value;
    }
    return '';
  }
  return {exactName,fetchName};
});
