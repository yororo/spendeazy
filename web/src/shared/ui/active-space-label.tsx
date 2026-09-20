interface ActiveSpaceLabelProps {
  readonly spaceId?: string;
}

function ActiveSpaceLabel({ spaceId }: ActiveSpaceLabelProps) {
  return (
    <span className="mb-3 inline-flex min-h-8 items-center bg-primary px-3 font-mono text-sm font-semibold text-primary-foreground">
      {spaceId === undefined ? "Personal" : "Shared"}
    </span>
  );
}

export { ActiveSpaceLabel };
