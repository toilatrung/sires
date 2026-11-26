// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Planning fixtures following the reference screens Plan, Plan--view-graph(-cycle), PlanCompare, TaskReview (PID-00082
// S01): project “RAG trong tổng quan tài liệu”, v2 Superseded, v3 Approved (baseline), v4 Proposed (differs from v3,
// two assumptions in the shared context), v5 Draft whose added dependency T-3.1 → T-2.3 closes the cycle
// T-2.3 → T-2.5 → T-3.1 → T-2.3. Tasks cover the Task statuses of PRD 9.8, manual and agent; T-2.1 In Review with
// three criteria.

import { ACCOUNT_ID, id, projectIds } from '../../../shell/mock';
import type { Fixtures, Schemas } from '../../../shell/mock';

export const PROJECT_ID = projectIds.rag;
export const PLAN_ID = id('plan', 1);
export const ACCOUNT = ACCOUNT_ID;

export const V2 = id('planVersion', 2);
export const V3 = id('planVersion', 3);
export const V4 = id('planVersion', 4);
export const V5 = id('planVersion', 5);

const researcher: Schemas['ActorRef'] = { type: 'researcher', accountId: ACCOUNT };
const orchestrator = (run: number): Schemas['ActorRef'] => ({ type: 'agent', agent: 'orchestrator', agentRunId: id('agentRun', run) });

/**
 * Task ids by stable key. Six of them reuse the ids of the shared demo data (shell/mock/fixtures) so that workflows,
 * chat, pending actions and notifications of other areas point at the same Task in the same status; the others take
 * numbers the shared data does not use (11–13 belong to the “learning” project).
 */
export const T = {
  '1.1': id('task', 1),
  '1.2': id('task', 21),
  '2.1': id('task', 22),
  '2.2': id('task', 2),
  '2.3': id('task', 3),
  '2.4': id('task', 5),
  '2.5': id('task', 4),
  '2.6': id('task', 23),
  '2.7': id('task', 24),
  '3.1': id('task', 6),
  '3.2': id('task', 25),
} as const;
export type TaskKey = keyof typeof T;

export const PHASES: Schemas['Phase'][] = [
  { id: id('phase', 1), order: 1, name: 'Xác định câu hỏi', objective: 'Làm rõ câu hỏi nghiên cứu và phạm vi.' },
  { id: id('phase', 2), order: 2, name: 'Tổng quan tài liệu', objective: 'Tìm, sàng lọc và so sánh các nghiên cứu RAG.' },
  { id: id('phase', 3), order: 3, name: 'Tổng hợp và viết', objective: 'Viết chương 2 và bảng so sánh phương pháp.' },
];

type Def = Schemas['TaskDefinition'];
const criteria = (...texts: string[]) => texts.map((text, i) => ({ id: `AC${i + 1}`, text }));
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function def(key: TaskKey, version: string, phase: number, title: string, extra: Partial<Def> = {}): Def {
  return {
    planVersionId: version,
    taskId: T[key],
    stableKey: `T-${key}`,
    phaseId: id('phase', phase),
    title,
    objective: title,
    executionLabel: 'Available for agent',
    expectedOutputs: [{ artifactType: 'synthesis', description: 'Bản tổng hợp có trích dẫn', required: true }],
    acceptanceCriteria: criteria('Mọi luận điểm có ít nhất một evidence từ Trusted Library.'),
    ...extra,
  };
}

interface Changes {
  t25DependsOn?: string[];
  t23DependsOn?: string[];
  extra?: (version: string) => Def[];
}

/** Task definitions of a Plan Version; v3 is the baseline the board shows by default. */
export function definitions(version: string, changes: Changes = {}): Def[] {
  return [
    def('1.1', version, 1, 'Làm rõ câu hỏi nghiên cứu', {
      proposedAgent: 'orchestrator',
      expectedOutputs: [{ artifactType: 'note', description: 'Câu hỏi nghiên cứu', required: true }],
    }),
    def('1.2', version, 1, 'Chọn tiêu chí đưa vào và loại trừ', { proposedAgent: 'synthesis', dependsOn: [T['1.1']] }),
    def('2.1', version, 2, 'Tổng hợp định nghĩa khái niệm', {
      proposedAgent: 'synthesis',
      dependsOn: [T['1.2']],
      expectedOutputs: [
        { artifactType: 'synthesis', description: 'Bản tổng hợp định nghĩa', required: true },
        { artifactType: 'table', description: 'Bảng thuật ngữ', required: true },
        { artifactType: 'note', description: 'Ghi chú nguồn', required: false },
      ],
      acceptanceCriteria: criteria(
        'Mỗi khái niệm có ít nhất hai định nghĩa từ nguồn khác nhau.',
        'Mọi định nghĩa có trích dẫn tới Trusted Reference.',
        'Ghi rõ định nghĩa được chọn và lý do.',
      ),
    }),
    def('2.2', version, 2, 'Tìm nghiên cứu 2019–2026', { proposedAgent: 'evidence_retrieval', dependsOn: [T['1.2']] }),
    def('2.3', version, 2, 'So sánh phương pháp đo', { proposedAgent: 'synthesis', dependsOn: changes.t23DependsOn ?? [T['2.2']] }),
    def('2.4', version, 2, 'Phỏng vấn chuyên gia về tiêu chí đánh giá', {
      executionLabel: 'Manual editor requirement',
      description: 'Phỏng vấn TS. Trần Quốc Bảo về tiêu chí đánh giá độ tin cậy của trích dẫn.',
      expectedOutputs: [{ artifactType: 'manual_submission', description: 'Biên bản phỏng vấn', required: true }],
      acceptanceCriteria: criteria('Biên bản ghi đủ năm câu hỏi và trả lời.'),
    }),
    def('2.5', version, 2, 'Ma trận so sánh phương pháp', {
      proposedAgent: 'synthesis',
      dependsOn: changes.t25DependsOn ?? [T['2.3']],
      requiredInputs: [{ type: 'decision', description: 'Tiêu chí so sánh đã được xác nhận' }],
      expectedOutputs: [{ artifactType: 'table', description: 'Ma trận so sánh', required: true }],
      acceptanceCriteria: criteria('Ma trận có ít nhất 3 phương pháp, mỗi ô có evidence', 'Mọi claim có mức hỗ trợ khác Not Assessed'),
      checklist: [
        { id: 'c1', text: 'Chốt danh sách phương pháp' },
        { id: 'c2', text: 'Kiểm evidence của từng ô' },
      ],
    }),
    def('2.6', version, 2, 'Sơ đồ kiến trúc RAG', {
      proposedAgent: 'diagram',
      expectedOutputs: [{ artifactType: 'diagram', description: 'Sơ đồ kiến trúc', required: true }],
    }),
    def('2.7', version, 2, 'Ghi chú đọc 5 bài nền tảng', {
      executionLabel: 'Manual editor requirement',
      expectedOutputs: [{ artifactType: 'manual_submission', description: 'Ghi chú đọc', required: true }],
      acceptanceCriteria: criteria('Mỗi bài có tóm tắt và nhận xét.'),
    }),
    def('3.1', version, 3, 'Viết mục 2.3 — So sánh phương pháp', {
      proposedAgent: 'writing',
      dependsOn: [T['2.5']],
      expectedOutputs: [{ artifactType: 'draft_section', description: 'Mục 2.3', required: true }],
    }),
    ...(changes.extra?.(version) ?? []),
  ];
}

type Content = Pick<Schemas['PlanVersion'], 'goals' | 'methods' | 'milestones' | 'deliverables' | 'risks' | 'assumptions' | 'phases' | 'tasks'>;

function content(version: string, changes: Changes = {}, goals?: string[]): Content {
  return {
    goals: goals ?? ['Đánh giá mức độ RAG giảm trích dẫn sai trong tổng quan tài liệu y sinh.', 'Đề xuất quy trình kiểm chứng trích dẫn cho NCS.'],
    methods: ['Tổng quan hệ thống theo PRISMA 2020', 'Phân tích định lượng tỉ lệ trích dẫn sai'],
    milestones: ['Xong tổng quan tài liệu (Phase 2)'],
    deliverables: ['Chương 2 luận án', 'Bảng so sánh phương pháp'],
    risks: ['Thiếu nghiên cứu tiếng Việt'],
    assumptions: ['Có đủ 30 nghiên cứu đạt tiêu chí'],
    phases: PHASES,
    tasks: definitions(version, changes),
  } as Content;
}

function version(versionId: string, versionNumber: number, status: Schemas['PlanVersionStatus'], hours: number, body: Content, extra: Partial<Schemas['PlanVersion']> = {}): Schemas['PlanVersion'] {
  return {
    id: versionId,
    accountId: ACCOUNT,
    projectId: PROJECT_ID,
    createdAt: hoursAgo(hours),
    createdBy: orchestrator(90 + versionNumber),
    rowVersion: 1,
    planId: PLAN_ID,
    versionNumber,
    status,
    contextVersionId: id('context', versionNumber),
    changeClass: 'minor',
    ...body,
    ...extra,
  } as Schemas['PlanVersion'];
}

export function initialVersions(): Schemas['PlanVersion'][] {
  return [
    version(V2, 2, 'Superseded', 24 * 14, content(V2), { changeSummary: 'Tách bước tìm nghiên cứu thành Task riêng.' }),
    version(V3, 3, 'Approved', 24 * 9, content(V3), {
      basedOnVersionId: V2,
      changeSummary: 'Thêm Task phỏng vấn chuyên gia.',
      provenance: {
        createdBy: orchestrator(93),
        inputs: [],
        deliberation: { status: 'deliberated', deliberationId: id('workflow', 31), recordArtifactVersionId: id('artifactVersion', 31) },
      },
      approval: {
        approvedBy: researcher,
        decidedAt: hoursAgo(24 * 9 - 2),
        decision: 'approved',
        objectType: 'plan_version',
        objectId: V3,
        objectVersion: 1,
        apr: 'APR-01',
      },
    } as Partial<Schemas['PlanVersion']>),
    version(
      V4,
      4,
      'Proposed',
      6,
      content(
        V4,
        {
          t25DependsOn: [T['2.3'], T['2.2']],
          extra: (v) => [
            def('3.2', v, 3, 'Vẽ sơ đồ PRISMA cho chương 2', {
              proposedAgent: 'diagram',
              expectedOutputs: [{ artifactType: 'diagram', description: 'Sơ đồ PRISMA', required: true }],
            }),
          ],
        },
        ['Đánh giá mức độ RAG giảm trích dẫn sai trong tổng quan tài liệu y sinh và giáo dục.', 'Đề xuất quy trình kiểm chứng trích dẫn cho NCS.'],
      ),
      {
        basedOnVersionId: V3,
        changeClass: 'material',
        changeSummary: 'Mở rộng phạm vi sang giáo dục; T-2.5 chờ thêm kết quả tìm kiếm của T-2.2.',
        provenance: { createdBy: orchestrator(94), inputs: [], deliberation: { status: 'skipped', deliberationId: null, recordArtifactVersionId: null } },
      } as Partial<Schemas['PlanVersion']>,
    ),
    version(V5, 5, 'Draft', 1, content(V5, { t23DependsOn: [T['2.2'], T['3.1']] }), {
      basedOnVersionId: V3,
      createdBy: researcher,
      changeSummary: 'Cho T-2.3 dùng kết quả của mục 2.3.',
      provenance: null,
    } as Partial<Schemas['PlanVersion']>),
  ];
}

export const PASS_DETAIL: Partial<Record<Schemas['ReadinessCheck']['code'], string>> = {
  'RC-01': 'Plan Version đã duyệt',
  'RC-02': 'Project đang Active',
  'RC-03': 'Không có workflow khác đang chạy',
  'RC-04': 'Task tiên quyết đã Completed',
  'RC-05': '12 Trusted Reference Indexed',
  'RC-06': 'Đầu vào đã được chấp nhận',
  'RC-07': 'Không có câu hỏi đang chờ',
  'RC-08': 'agent có kết nối hợp lệ',
  'RC-09': 'Orchestrator xác nhận đủ ngữ cảnh',
};

const passing = (...codes: Schemas['ReadinessCheck']['code'][]): Schemas['ReadinessCheck'][] =>
  codes.map((code) => ({ code, passed: true, detail: PASS_DETAIL[code] }));

export const readiness = (taskId: string, checks: Schemas['ReadinessCheck'][], hours = 1): Schemas['ReadinessResult'] => ({
  taskId,
  planVersionId: V3,
  passed: checks.every((c) => c.passed),
  checks,
  at: hoursAgo(hours),
});

function task(key: TaskKey, status: Schemas['TaskStatus'], extra: Partial<Schemas['Task']> = {}): Schemas['Task'] {
  return {
    id: T[key],
    accountId: ACCOUNT,
    projectId: PROJECT_ID,
    createdAt: hoursAgo(24 * 9),
    createdBy: researcher,
    updatedAt: hoursAgo(2),
    rowVersion: 1,
    stableKey: `T-${key}`,
    status,
    currentDefinition: definitions(V3).find((d) => d.taskId === T[key])!,
    needsReview: false,
    checklistState: [],
    allowedActions: [],
    ...extra,
  };
}

export function initialTasks(): Schemas['Task'][] {
  return [
    task('1.1', 'Completed', { allowedActions: ['reopen'] }),
    task('1.2', 'Completed', { allowedActions: ['reopen'] }),
    task('2.1', 'In Review', { allowedActions: ['review', 'cancel'] }),
    task('2.2', 'In Progress', { activeWorkflowId: id('workflow', 1), allowedActions: ['cancel'] }),
    task('2.3', 'Waiting for User', { activeWorkflowId: id('workflow', 2), allowedActions: ['cancel'] }),
    task('2.4', 'Ready', {
      allowedActions: ['activate', 'cancel', 'recheck_readiness'],
      lastReadiness: readiness(T['2.4'], passing('RC-01', 'RC-02', 'RC-03', 'RC-04', 'RC-07')),
    }),
    task('2.5', 'Blocked', {
      allowedActions: ['recheck_readiness', 'cancel'],
      lastReadiness: readiness(T['2.5'], [
        { code: 'RC-04', passed: false, detail: 'Dependency T-2.3 chưa Completed' },
        { code: 'RC-07', passed: false, detail: 'Thiếu đầu vào: tiêu chí so sánh chưa được xác nhận' },
        ...passing('RC-08', 'RC-05'),
      ]),
    }),
    task('2.6', 'Blocked', {
      allowedActions: ['recheck_readiness', 'cancel'],
      lastReadiness: readiness(T['2.6'], [{ code: 'RC-08', passed: false, detail: 'Diagram Agent chưa có kết nối hợp lệ' }, ...passing('RC-04', 'RC-05')]),
    }),
    task('2.7', 'In Review', { allowedActions: ['review', 'cancel'] }),
    task('3.1', 'Draft', { allowedActions: ['cancel'] }),
  ];
}

export function initialReviews(): Schemas['TaskReview'][] {
  return [
    {
      id: id('audit', 71),
      accountId: ACCOUNT,
      projectId: PROJECT_ID,
      createdAt: hoursAgo(30),
      createdBy: researcher,
      rowVersion: 1,
      taskId: T['2.2'],
      outcome: 'returned',
      reasonCode: 'quality_insufficient',
      feedback: 'Cần thêm nghiên cứu năm 2024–2025.',
    },
  ];
}

/**
 * Outputs of T-2.1 for the Task review in the dev mock (TaskReview reference): synthesis v2 Draft, table v1 Accepted.
 * Data only: the artifact operations stay with the research area, so accepting a version does not persist here.
 */
export function outputFixtures(): Pick<Fixtures, 'Artifact' | 'ArtifactVersion'> {
  const at = hoursAgo(5);
  const base = { accountId: ACCOUNT, projectId: PROJECT_ID, createdAt: at, rowVersion: 1 };
  const synthesis = id('artifactVersion', 21);
  const table = id('artifactVersion', 22);
  const by: Schemas['ActorRef'] = { type: 'agent', agent: 'synthesis' };
  return {
    Artifact: [
      { ...base, id: id('artifact', 21), createdBy: by, type: 'synthesis', title: 'Định nghĩa hallucination', taskId: T['2.1'], currentAcceptedVersionId: null, latestVersion: { id: synthesis, versionNumber: 2, status: 'Draft', createdAt: at } },
      { ...base, id: id('artifact', 22), createdBy: by, type: 'table', title: 'Bảng thuật ngữ', taskId: T['2.1'], currentAcceptedVersionId: table, latestVersion: { id: table, versionNumber: 1, status: 'Accepted', createdAt: at } },
    ],
    ArtifactVersion: [
      {
        ...base, id: synthesis, createdBy: by, artifactId: id('artifact', 21), versionNumber: 2, format: 'markdown', contentHash: 'sha256:21', status: 'Draft',
        content: 'Hallucination được định nghĩa là nội dung do mô hình tạo ra không trung thành với nguồn hoặc không có căn cứ thực tế. Các nghiên cứu phân biệt intrinsic và extrinsic hallucination.',
        provenance: { createdBy: by, inputs: [] },
      },
      {
        ...base, id: table, createdBy: by, artifactId: id('artifact', 22), versionNumber: 1, format: 'markdown', contentHash: 'sha256:22', status: 'Accepted',
        content: '| Thuật ngữ | Định nghĩa | Nguồn |', provenance: { createdBy: by, inputs: [] },
      },
    ],
  };
}
