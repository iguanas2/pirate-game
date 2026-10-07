export type NormalizedInputState = {
  thrust: number;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
  paused: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const createNormalizedInputState = (): NormalizedInputState => ({
  thrust: 0,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
  paused: false,
});

export const normalizeInputState = (
  input: Partial<NormalizedInputState> = {},
): NormalizedInputState => ({
  thrust: clamp(input.thrust ?? 0, 0, 1),
  turnLeft: Boolean(input.turnLeft),
  turnRight: Boolean(input.turnRight),
  fireFront: Boolean(input.fireFront),
  fireLeft: Boolean(input.fireLeft),
  fireRight: Boolean(input.fireRight),
  paused: Boolean(input.paused),
});

export const toSimulationInput = (input: Partial<NormalizedInputState>) => {
  const normalized = normalizeInputState(input);

  return {
    turn: Number(normalized.turnRight) - Number(normalized.turnLeft),
    thrust: normalized.thrust,
    fireFront: normalized.fireFront,
    fireLeft: normalized.fireLeft,
    fireRight: normalized.fireRight,
    paused: normalized.paused,
  };
};
