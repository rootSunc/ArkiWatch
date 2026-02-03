"use client";

import { Fragment, type ReactNode } from "react";

type AssistantMessageBodyProps = {
  text: string;
};

type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "heading"; level: number; text: string };

export function AssistantMessageBody({ text }: AssistantMessageBodyProps) {
  const blocks = splitBlocks(text.trim());
  if (!blocks.length) {
    return null;
  }

  return (
    <div className="assistant-message-body">
      {blocks.map((block, index) => renderBlock(block, `block-${index}`))}
    </div>
  );
}

function isBulletLine(line: string): boolean {
  return /^[-*•]\s+/.test(line.trim());
}

function isOrderedLine(line: string): boolean {
  return /^\d+\.\s+/.test(line.trim());
}

function splitBlocks(text: string): Block[] {
  const chunks = text.split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean);
  const blocks: Block[] = [];

  for (const chunk of chunks) {
    blocks.push(...splitChunk(chunk));
  }

  return blocks;
}

function splitChunk(chunk: string): Block[] {
  const lines = chunk.split("\n").map((line) => line.trimEnd());
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        kind: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (isBulletLine(line) || isOrderedLine(line)) {
      const ordered = isOrderedLine(line);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index]?.trim() ?? "";
        if (!current) {
          index += 1;
          break;
        }
        if (ordered ? isOrderedLine(current) : isBulletLine(current)) {
          items.push(
            current.replace(ordered ? /^\d+\.\s+/ : /^[-*•]\s+/, ""),
          );
          index += 1;
          continue;
        }
        break;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index]?.trim() ?? "";
      if (!current || isBulletLine(current) || isOrderedLine(current)) {
        break;
      }
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }
    if (paragraphLines.length) {
      blocks.push({ kind: "paragraph", lines: paragraphLines });
    }
  }

  return blocks;
}

function renderBlock(block: Block, key: string): ReactNode {
  if (block.kind === "heading") {
    return (
      <p className={`assistant-message-heading assistant-message-heading-${block.level}`} key={key}>
        {formatInline(block.text)}
      </p>
    );
  }

  if (block.kind === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag className="assistant-message-list" key={key}>
        {block.items.map((item, index) => (
          <li key={`${key}-${index}`}>{formatInline(item)}</li>
        ))}
      </ListTag>
    );
  }

  const paragraphText = block.lines.join("\n");
  return (
    <p className="assistant-message-paragraph" key={key}>
      {formatInline(paragraphText)}
    </p>
  );
}

function formatInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`text-${partIndex++}`}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`strong-${partIndex++}`}>{token.slice(2, -2)}</strong>,
      );
    } else {
      nodes.push(<code key={`code-${partIndex++}`}>{token.slice(1, -1)}</code>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`text-${partIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return nodes.length ? nodes : [text];
}
