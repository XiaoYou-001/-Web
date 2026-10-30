const stack=[],states=new WeakMap()
const controls=element=>[...element.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length)
export const modalFocus={
 mounted(element){
  const previous=document.activeElement
  element.tabIndex=-1
  const keydown=event=>{
   if(event.key!=='Tab'||stack.at(-1)!==element)return
   const nodes=controls(element),first=nodes[0]||element,last=nodes.at(-1)||element
   if(!nodes.length||event.shiftKey&&(document.activeElement===first||document.activeElement===element)||!event.shiftKey&&(document.activeElement===last||document.activeElement===element)){
    event.preventDefault();(event.shiftKey?last:first).focus()
   }
  }
  stack.push(element);states.set(element,{previous,keydown});element.addEventListener('keydown',keydown)
  queueMicrotask(()=>{if(element.isConnected&&stack.at(-1)===element)(controls(element)[0]||element).focus()})
 },
 beforeUnmount(element){
  const state=states.get(element),top=stack.at(-1)===element,index=stack.indexOf(element)
  if(index>=0)stack.splice(index,1)
  if(state){element.removeEventListener('keydown',state.keydown);if(top&&state.previous?.isConnected)state.previous.focus()}
  states.delete(element)
 }
}
