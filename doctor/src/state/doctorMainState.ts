export type DoctorMainUiStatus = "idle" | "updated" | "modal_open" | "error";

export interface DoctorMainState {
  uiStatus: DoctorMainUiStatus;
  isEndSessionModalOpen: boolean;
  hasFetchedResult: boolean;
}

export function createInitialDoctorMainState(): DoctorMainState {
  return {
    uiStatus: "idle",
    isEndSessionModalOpen: false,
    hasFetchedResult: false,
  };
}

export function markViewingStatusAsUpdated(
  prev: DoctorMainState
): DoctorMainState {
  return {
    ...prev,
    uiStatus: "updated",
    hasFetchedResult: true,
    isEndSessionModalOpen: false,
  };
}

export function openEndSessionModal(prev: DoctorMainState): DoctorMainState {
  return {
    ...prev,
    uiStatus: "modal_open",
    isEndSessionModalOpen: true,
  };
}

export function closeEndSessionModal(
  prev: DoctorMainState
): DoctorMainState {
  return {
    ...prev,
    uiStatus: prev.hasFetchedResult ? "updated" : "idle",
    isEndSessionModalOpen: false,
  };
}
