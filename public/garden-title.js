/* Verdant garden display title. No new database store/version is needed. */
'use strict';
(function(root) {
  const ID = 'gardenTitle', DEFAULT = 'My garden', MAX_LENGTH = 100;
  function validate(value) {
    if (typeof value !== 'string') throw new Error('Garden title must be text.');
    const title = value.trim().normalize('NFC');
    if (!title || title.length > MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(title))
      throw new Error(`Garden title must be 1–${MAX_LENGTH} characters without control characters.`);
    return title;
  }
  function record(value) { return {id: ID, value: validate(value)}; }
  function validateRecord(item) {
    if (!item || item.id !== ID) throw new Error('Invalid garden title record.');
    validate(item.value);
    return item;
  }
  function fromSettings(settings) {
    const found = (settings || []).find(item => item?.id === ID);
    return found ? validateRecord(found).value : DEFAULT;
  }
  const API = Object.freeze({ID, DEFAULT, MAX_LENGTH, validate, record, validateRecord, fromSettings});
  root.VerdantGardenTitle = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(globalThis);
