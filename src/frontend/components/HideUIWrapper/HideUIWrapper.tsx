import { useEffect, useState, type ReactNode } from 'react';

declare global {
  interface Window {
    globalKey?: {
      onToggle: (cb: (hide: boolean) => void) => () => void;
    };
  }
}

interface HideUIWrapperProps {
  children: ReactNode;
}

export const HideUIWrapper = ({ children }: HideUIWrapperProps) => {
  const [hideUI, setHideUI] = useState(false);

  useEffect(() => {
    console.log(
      '[HideUIWrapper] Mounted, globalKey available:',
      !!window.globalKey
    );
    if (!window.globalKey?.onToggle) return;

    const unsub = window.globalKey.onToggle((hide) => {
      console.log('[HideUIWrapper] Toggle received:', hide);
      setHideUI(hide);
    });
    return () => unsub();
  }, []);

  if (hideUI) {
    console.log('[HideUIWrapper] Hiding UI!');
    return <></>;
  }

  return children;
};
