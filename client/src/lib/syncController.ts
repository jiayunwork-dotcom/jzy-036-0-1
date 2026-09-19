import type { ControlNode, FieldNode, ParseResult } from '../../../shared/types';

/**
 * Bidirectional sync controller — the client-side source of truth for the
 * "last valid state" discipline.
 *
 * Rules that keep the two panes from fighting:
 *  - Text edits are parsed (debounced). A successful parse replaces the
 *    structure; a failed parse ONLY records the error — the structure and
 *    the preview stay pinned to the last valid state and remain editable.
 *  - Structure edits are serialized back to canonical text, replacing
 *    whatever is in the text pane (including invalid in-progress text) and
 *    clearing the error state.
 *  - Every async result is checked against a monotonic sequence number, so
 *    a slow response can never overwrite a newer edit from either side.
 */

export interface SyncEngine {
  parseText(text: string): Promise<ParseResult>;
  serializeStructure(structure: FieldNode): Promise<{ text: string; controls: ControlNode }>;
}

export interface SyncState {
  /** Last valid structure — what the visual editor and preview render. */
  structure: FieldNode | null;
  controls: ControlNode | null;
  /** Current text pane content (may be invalid). */
  text: string;
  /** Canonical text of the last valid structure — what gets saved/exported. */
  lastValidText: string;
  /** Human-readable reason the current text is invalid, or null. */
  textError: string | null;
}

export type SyncListener = (state: SyncState) => void;

export class SyncController {
  readonly state: SyncState = {
    structure: null,
    controls: null,
    text: '',
    lastValidText: '',
    textError: null,
  };

  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly engine: SyncEngine,
    private readonly notify: SyncListener = () => {},
    private readonly debounceMs = 300,
  ) {}

  /** Load a document's text into both panes (immediate, no debounce). */
  loadFromText(text: string): Promise<void> {
    this.state.text = text;
    return this.runParse(text, this.bump());
  }

  /** Text pane edit. Debounced parse; failure keeps the last valid structure. */
  editText(text: string): void {
    this.state.text = text;
    const seq = this.bump();
    if (this.timer) clearTimeout(this.timer);
    if (this.debounceMs <= 0) {
      void this.runParse(this.state.text, seq);
      return;
    }
    this.timer = setTimeout(() => {
      void this.runParse(this.state.text, seq);
    }, this.debounceMs);
  }

  /** Visual editor edit. Serializes back to text; always succeeds. */
  editStructure(structure: FieldNode): void {
    const seq = this.bump();
    this.chain = this.chain.then(async () => {
      const result = await this.engine.serializeStructure(structure);
      if (seq !== this.seq) return; // a newer edit superseded this one
      this.state.structure = structure;
      this.state.controls = result.controls;
      this.state.text = result.text;
      this.state.lastValidText = result.text;
      this.state.textError = null;
      this.notify(this.state);
    });
  }

  /** Resolves when all scheduled work has settled (used by tests). */
  settled(): Promise<void> {
    return this.chain;
  }

  private bump(): number {
    return ++this.seq;
  }

  private runParse(text: string, seq: number): Promise<void> {
    this.chain = this.chain.then(async () => {
      const result = await this.engine.parseText(text);
      if (seq !== this.seq) return; // superseded by a newer edit
      if (result.ok) {
        this.state.structure = result.structure;
        this.state.controls = result.controls;
        this.state.lastValidText = result.canonicalText;
        this.state.textError = null;
      } else {
        // Keep structure/controls/lastValidText untouched: the visual pane
        // and preview stay on the last valid state.
        this.state.textError = result.error;
      }
      this.notify(this.state);
    });
    return this.chain;
  }
}
