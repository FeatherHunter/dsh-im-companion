/** `@types/react-dom` 未进 devDependencies；本仓只有命令式面板需要挂一棵 React 子树（页头三件套），
 *  故只垫 createRoot / Root 两个符号。运行时真实现由宿主 module registry 提供（见 tsdown.config.ts 的
 *  CLIENT_EXTERNALS：react-dom / react-dom/client 一律 external，产物里是 require("react-dom/client")）。 */
declare module 'react-dom/client' {
  import type { ReactNode } from 'react'

  export interface Root {
    render(children: ReactNode): void
    unmount(): void
  }

  export function createRoot(
    container: Element | DocumentFragment,
    options?: { identifierPrefix?: string; onRecoverableError?: (error: unknown) => void },
  ): Root
}
