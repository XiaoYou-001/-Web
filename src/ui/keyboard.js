// WebKit can report keyCode 229 during IME candidate selection.
export function submitOnEnter(event, submit) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  return submit()
}
