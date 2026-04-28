"use client";

import PreSiteVisitModal from "@/components/PreSiteVisitModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  projectOptions?: string[];
  initialDate?: string;
  loadingProjectOptions?: boolean;
  onScheduled: () => void;
}

export default function ScheduleMeetingModal(props: Props) {
  return <PreSiteVisitModal {...props} />;
}
