import { createModal, type ModalController } from "../../../../shared/components/Modal";

export function createFileDeleteConfirmModal(options: {
  fileName: string;
  onConfirm: () => void;
  onCancel?: () => void;
}): ModalController {
  return createModal({
    title: "資料を削除しますか？",
    description: `次の資料を削除します。\n${options.fileName}`,
    confirmLabel: "削除",
    cancelLabel: "キャンセル",
    onConfirm: options.onConfirm,
    onCancel: options.onCancel,
  });
}
