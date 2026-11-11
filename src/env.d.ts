export {}

declare global {
  interface Window {
    dAsst?: {
      load: () => Promise<unknown>
      save: (data: unknown) => Promise<boolean>
      notify: (payload: { title: string; body: string }) => void
      setCloseBehavior: (value: string) => void
      respondClose: (action: string) => void
      onCloseRequest: (handler: () => void) => () => void
      onNavigate: (handler: (view: string) => void) => () => void
      aiConfigLoad: () => Promise<import('./types').AIConfigPublic>
      aiConfigSave: (config: import('./types').AIConfigInput) => Promise<import('./types').AIConfigPublic>
      aiTest: () => Promise<{ ok: boolean; message: string }>
      aiParse: (payload: { text: string; context: unknown }) => Promise<unknown>
    }
  }
}

declare module '*.css' {
  const css: string
  export default css
}
