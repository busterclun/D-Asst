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
    }
  }
}

declare module '*.css' {
  const css: string
  export default css
}
