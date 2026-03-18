import {
  SAMPLE_DOCUMENT_HTML,
  SAMPLE_DOCUMENT_TITLE,
} from "./sampleDocumentHtml";

export type UnviewedSection = {
  id: string;
  title: string;
  sectionId: string;
};

export interface AttentionMarker {
  id: string;
  sectionId: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface DoctorMainMockData {
  patientName: string;
  patientChartId: string;
  patientViewStatusLabel: "閲覧中" | "不在";
  elapsedTimeLabel: string;
  progressPercent: number;
  unviewedSections: UnviewedSection[];
  attentionMarkers: AttentionMarker[];
}

export const doctorMainMockData: DoctorMainMockData = {
  patientName: "田中 太郎",
  patientChartId: "KARTE-20481",
  patientViewStatusLabel: "閲覧中",
  elapsedTimeLabel: "12分",
  progressPercent: 68,
  unviewedSections: [
    {
      id: "uv-01",
      title: "副作用について",
      sectionId: "section-side-effects",
    },
    {
      id: "uv-02",
      title: "食事制限",
      sectionId: "section-dietary-restrictions",
    },
    {
      id: "uv-03",
      title: "緊急時の連絡",
      sectionId: "section-emergency-contact",
    },
  ],
  attentionMarkers: [
    {
      id: "marker-01",
      sectionId: "section-side-effects",
      top: 210,
      left: 20,
      width: 620,
      height: 170,
    },
    {
      id: "marker-02",
      sectionId: "section-dietary-restrictions",
      top: 760,
      left: 20,
      width: 620,
      height: 170,
    },
    {
      id: "marker-03",
      sectionId: "section-emergency-contact",
      top: 1040,
      left: 20,
      width: 620,
      height: 180,
    },
  ],
};

export const DOCTOR_MAIN_MOCK = {
  patientName: doctorMainMockData.patientName,
  patientChartId: doctorMainMockData.patientChartId,
  patientViewStatusLabel: doctorMainMockData.patientViewStatusLabel,
  elapsedTimeLabel: doctorMainMockData.elapsedTimeLabel,
  progressPercent: doctorMainMockData.progressPercent,
  unviewedSections: doctorMainMockData.unviewedSections.map((item) => item.title),
  attentionMarkers: doctorMainMockData.attentionMarkers,
  documentTitle: SAMPLE_DOCUMENT_TITLE,
  documentHtml: SAMPLE_DOCUMENT_HTML,
};
