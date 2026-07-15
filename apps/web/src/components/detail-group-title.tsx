import React, { PropsWithChildren, ReactElement } from "react";

export const DetailGroupTitle = (props: Props): ReactElement => {
  return (
    <p className="text-[13px] font-medium text-muted-foreground px-3">
      {props.children}
    </p>
  );
};

interface Props extends PropsWithChildren {}
