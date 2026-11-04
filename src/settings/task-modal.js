// Shared Settings task dialog. Callers own the work; only they can declare it
// finished. Escape cancels cooperatively, never hides work that is still running.
let nextId=0;
export function createTaskModal({title,cancellable=false,completionLabel='Done'}) {
  const controller=new AbortController();
  const {signal}=controller;
  const previousFocus=document.activeElement;
  const dialog=document.createElement('dialog');
  const titleId=`task-title-${++nextId}`;
  dialog.className='modal task-modal';
  dialog.setAttribute('aria-labelledby',titleId);
  dialog.innerHTML=`<div class="modal-head"><h2></h2></div>
    <div class="modal-body"><p class="task-status" role="status" aria-live="polite" aria-atomic="true"></p>
    <p class="form-note warning" data-summary hidden></p></div>
    <div class="modal-footer"><button class="btn btn-outline" data-cancel>Cancel</button>
    <button class="btn btn-primary" data-confirm hidden></button>
    <button class="btn btn-primary" data-action hidden></button>
    <button class="btn btn-primary" data-done disabled></button></div>`;
  const heading=dialog.querySelector('h2');
  heading.id=titleId;heading.textContent=title;
  const status=dialog.querySelector('.task-status');
  const summary=dialog.querySelector('[data-summary]');
  const cancel=dialog.querySelector('[data-cancel]');
  const confirm=dialog.querySelector('[data-confirm]');
  const done=dialog.querySelector('[data-done]');
  const actionButton=dialog.querySelector('[data-action]');
  done.textContent=completionLabel;
  cancel.hidden=!cancellable;
  let finished=false,closed=false,escapeCloses=false,resolveClosed;
  const dismissed=new Promise(resolve=>{resolveClosed=resolve;});
  const report=text=>{status.textContent=text;};
  const close=()=>{
    if(closed)return;
    closed=true;dialog.close();dialog.remove();previousFocus?.focus();resolveClosed();
  };
  const cancelTask=()=>{
    if(!cancellable||cancel.disabled||finished)return;
    controller.abort();cancel.disabled=true;report('Cancelling…');
  };
  cancel.onclick=cancelTask;
  dialog.addEventListener('cancel',event=>{
    event.preventDefault();
    if(finished){if(escapeCloses&&!done.disabled)done.click();}else cancelTask();
  });
  document.body.append(dialog);dialog.showModal();
  return {
    signal,report,dismissed,
    setCompletionLabel(label){done.textContent=label;},
    lock(text){cancellable=false;cancel.disabled=true;report(text);},
    async confirm(text,label){
      signal.throwIfAborted();
      summary.textContent=text;summary.hidden=false;
      confirm.textContent=label;confirm.hidden=false;
      try{
        await new Promise((resolve,reject)=>{
          const abort=()=>{confirm.onclick=null;reject(signal.reason);};
          signal.addEventListener('abort',abort,{once:true});
          confirm.onclick=()=>{signal.removeEventListener('abort',abort);confirm.onclick=null;resolve();};
          if(cancellable)cancel.focus();else confirm.focus();
        });
        signal.throwIfAborted();
      }finally{summary.hidden=true;confirm.hidden=true;}
    },
    finish({onDone,label=completionLabel,action}={}){
      finished=true;escapeCloses=!onDone;cancel.hidden=true;confirm.hidden=true;summary.hidden=true;
      actionButton.hidden=!action;
      actionButton.disabled=false;
      if(action){
        actionButton.textContent=action.label;
        actionButton.onclick=async()=>{
          actionButton.disabled=true;done.disabled=true;
          try{await action.run();}
          catch(err){report('Could not complete action: '+(err?.message||err));}
          finally{actionButton.disabled=false;done.disabled=false;actionButton.focus();}
        };
      }
      done.className=action?'btn btn-outline':'btn btn-primary';
      done.textContent=label;done.disabled=false;
      done.onclick=async()=>{
        done.disabled=true;actionButton.disabled=true;
        try{await onDone?.();close();}
        catch(err){report('Could not complete action: '+(err?.message||err));done.disabled=false;actionButton.disabled=false;done.focus();}
      };
      if(action)actionButton.focus();else done.focus();
    }
  };
}
