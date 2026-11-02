"""Run against the fully packaged static application, not a fixture."""
import subprocess, time, re
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
cmd=['python','-m','http.server','8765','--bind','127.0.0.1','-d',str(root/'dist')]
server=subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 time.sleep(.7)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader'])
  context=browser.new_context(viewport={'width':420,'height':850},accept_downloads=True)
  page=context.new_page()
  errors=[];failed=[];logs=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('requestfailed',lambda r:failed.append((r.url,r.failure)))
  page.on('console',lambda m:logs.append((m.type,m.text)) if m.type=='error' else None)
  response=page.goto('http://127.0.0.1:8765/',wait_until='domcontentloaded',timeout=10000)
  print('HTTP',response.status,'title',page.title())
  try:
   page.wait_for_function('!!window.VerdantUI',timeout=10000)
   page.wait_for_timeout(900)
  except Exception as e: print('MOUNT WAIT ERROR:',str(e))
  print('Vue:',page.locator('#app').get_attribute('data-v-app'),'Tabs:',page.locator('.main-tabs .tab').count())
  print('maplibre:',page.evaluate('!!window.maplibregl?.Map'),'version:',page.evaluate('window.maplibregl?.version'))
  print('DB:',page.evaluate('typeof indexedDB'), 'Map frame:',page.locator('#mapCanvas').count())
  print('SW:',page.evaluate('navigator.serviceWorker?.controller?.scriptURL || "not controlled yet"'))
  page.locator('[data-tab=settings]').click(timeout=5000);page.wait_for_timeout(700)
  print('Settings active:',page.locator('#page-settings').is_visible(), 'mapCanvas detached:',page.locator('#mapCanvas').count()==0)
  page.locator('[data-action=export]').click(timeout=5000)
  page.wait_for_selector('#settingsManagementRoot #create',timeout=5000)
  print('Backup UI:',page.locator('#settingsManagementRoot #create').inner_text())
  page.locator('.management-back').click(timeout=5000)
  page.locator('[data-action=optimize-photos]').click(timeout=5000)
  page.wait_for_selector('#settingsManagementRoot #start',timeout=5000)
  print('Photo optimizer UI:',page.locator('#settingsManagementRoot #start').inner_text())
  page.locator('.management-back').click(timeout=5000)
  page.locator('[data-tab=map]').click(timeout=5000)
  page.wait_for_timeout(1000)
  print('Map recreated',page.locator('#mapCanvas').count()==1)
  print('Errors:',errors)
  print('Request fail:',failed)
  print('Console err:',logs[:10])
  assert page.evaluate('!!window.maplibregl?.Map')
  assert page.locator('#page-map').is_visible()
  assert not errors,errors
  assert not failed,failed
  assert not logs,logs
  print('PASS: fully packaged static SPA, MapLibre, Settings workspaces, management tools')
  context.close();browser.close()
finally:
 server.terminate();server.wait(timeout=5)
