"use client";

import { memo } from "react";

type Props = {
  src: string;
};

function MenuPreviewPanelComponent({ src }: Props) {
  return (
    <section className="menu-editor__preview">
      <iframe
        className="menu-editor__preview-frame"
        src={src}
        title="Menu preview"
        loading="lazy"
      />
    </section>
  );
}

export const MenuPreviewPanel = memo(MenuPreviewPanelComponent);
