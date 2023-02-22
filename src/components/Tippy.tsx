import styled from "styled-components";
import TippyReact, { TippyProps } from "@tippyjs/react";

export function Tippy(props: TippyProps) {
  return (
    <TippyReact
      duration={0}
      {...props}
      content={
        <span className="rounded-md p-2 bg-white text-black dark:bg-neutral-800 dark:text-white drop-shadow-xl">
          {props.content}
        </span>
      }
    >
      {props.children}
    </TippyReact>
  );
}
