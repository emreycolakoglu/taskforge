import React, { PropsWithChildren, ReactElement } from "react";

export const DetailGroup = (props: PropsWithChildren): ReactElement => {
  return <div className="flex flex-col gap-2 mb-6">{props.children}</div>;
};
