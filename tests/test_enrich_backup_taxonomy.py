"""Safe, network-free regression tests for Verdant ZIP backup enrichment."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('enricher', ROOT/'scripts/enrich_backup_taxonomy.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    return {
        'format':'verdant-garden-backup','schemaVersion':2,'exportedAt':'2026-10-24T00:00:00Z',
        'data':{
            'plants':[{'id':'plant1','plantTypeId':'type1'}],
            'plantTypes':[
                {'id':'type1','scientificName':'Olea europaea','species':'europaea','nameEs':'Olivo'},
                {'id':'type2','scientificName':'Olea europaea','family':'ManualFamily'},
                {'id':'type3','scientificName':'Quercus robur'},
                {'id':'type4','scientificName':'Unresolved sp.'},
            ],
            'settings':[{'id':'gardenTitle','value':'Mi jardín'}],
            'images':[{'id':'photo1','path':'images/00001.bin','mimeType':'image/jpeg'}],
        },
    }


class EnrichmentTests(unittest.TestCase):
    def lookup(self, name, key, project):
        self.calls.append((name, project))
        result = {
            'Olea europaea':('Olea','Oleaceae','matched'),
            'Quercus robur':('','','ambiguous'),
            'Unresolved sp.':('','','no_exact_match'),
        }
        return result[name]

    def test_exact_name_match_and_nested_taxonomy(self):
        taxa = [{'scientificNameWithoutAuthor':'Olea europaea',
                 'genus':{'scientificNameWithoutAuthor':'Olea'},'family':'Oleaceae'},
                {'scientificNameWithoutAuthor':'Olea europaea ssp. europaea',
                 'genus':'Olea','family':'Oleaceae'}]
        self.assertEqual(m.find_exact(taxa, 'Olea europaea'),('Olea','Oleaceae','matched'))
        self.assertEqual(m.find_exact(taxa, 'Olea europaea L.'),('','','no_exact_match'))
        taxa.append({'scientificName':'Olea europaea', 'genus':'Olea', 'family':'WrongFamily'})
        self.assertEqual(m.find_exact(taxa, 'Olea europaea'),('','','ambiguous'))
        self.assertEqual(m.find_exact(taxa, 'Europaea olea'),('','','no_exact_match'))

    def test_enrich_never_overwrites_manual_taxonomy_and_never_guesses(self):
        backup=fixture(); self.calls=[]
        report=m.enrich(backup,'secret','k-world-flora',lookup=self.lookup, delay=0, log=lambda s: None)
        types=backup['data']['plantTypes']
        self.assertEqual((types[0]['genus'], types[0]['family']),('Olea','Oleaceae'))
        self.assertEqual((types[1]['genus'], types[1]['family']),('Olea','ManualFamily'))
        self.assertNotIn('family',types[2]);self.assertNotIn('genus',types[2]);self.assertNotIn('genus',types[3])
        self.assertEqual(types[0]['species'],'europaea','script must not unexpectedly change other exported fields')
        self.assertEqual([r['status'] for r in report],['updated','updated','ambiguous','no_exact_match'])
        self.assertEqual(len(self.calls),3,'same scientific name should use cached result')
        self.assertEqual(backup['data']['settings'][0]['value'],'Mi jardín')

    def test_zip_output_compatible_headers_and_image_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            src=Path(d)/'original.zip'; dst=Path(d)/'enriched.zip'
            backup=fixture(); img=b'JPEG-PHOTO-RAW'*2000
            with zipfile.ZipFile(src,'w',compression=zipfile.ZIP_STORED) as z:
                z.writestr('data.json',json.dumps(backup).encode('utf8'))
                z.writestr('images/00001.bin',img)
            read,is_zip=m.read_input(src)
            self.assertTrue(is_zip)
            self.calls=[]
            m.enrich(read,'secret','k-world-flora',lookup=self.lookup,delay=0,log=lambda s:None)
            m.write_output(src,dst,read,True)
            self.assertNotEqual(src.read_bytes(),dst.read_bytes())
            self.assertIsNone(zipfile.ZipFile(dst).testzip())
            with zipfile.ZipFile(dst) as z:
                self.assertEqual(z.read('images/00001.bin'),img)
                self.assertEqual(z.read('data.json').decode('utf8').count('Mi jardín'),1)
                self.assertTrue(all(i.flag_bits & 0x800 for i in z.infolist()),'Verdant requires bit 11')
                self.assertTrue(all(i.compress_type == 0 for i in z.infolist()))
            self.assertEqual(len(backup['data']['plantTypes']),4)
            with self.assertRaises(ValueError):m.write_output(src,src,read,True)
            with self.assertRaises(FileExistsError):m.write_output(src,dst,read,True)
            Path(d,'enriched.json').write_text('old data')

    def test_json_dump_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            src=Path(d)/'garden.json';dst=Path(d)/'garden.taxonomy-enriched.json'
            src.write_text(json.dumps(fixture()))
            backup,is_zip=m.read_input(src)
            self.assertFalse(is_zip)
            self.calls=[]
            m.enrich(backup,'secret','k-world-flora',lookup=self.lookup,delay=0,log=lambda s:None)
            m.write_output(src,dst,backup,is_zip)
            self.assertEqual(json.loads(dst.read_text())['data']['plantTypes'][0]['family'],'Oleaceae')
            self.assertNotIn('family',json.loads(src.read_text())['data']['plantTypes'][0])

if __name__=='__main__':unittest.main()
