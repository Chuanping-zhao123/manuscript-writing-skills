#!/usr/bin/env python3
"""
Inject EndNote ADDIN EN.CITE / EN.REFLIST field codes into an unpacked document.xml.

Usage:
    python inject_endnote.py <document_xml_path> <refs_verified_json_path>

This script:
1. Finds each individual <w:r>...</w:r> block that has superscript formatting
   and contains citation number text (digits, commas, en-dashes).
2. Wraps that single run in EN.CITE field codes with full EndNote XML metadata
   (including DisplayText, foreign-keys, and style wrappers).
3. Wraps the reference list section in EN.REFLIST field codes.

CRITICAL DESIGN NOTE — Two-Step Run Matching:
  The script uses a two-step approach to find citation runs:
    Step 1: Find each individual <w:r>...</w:r> block via regex.
    Step 2: Check if that single run contains <w:vertAlign w:val="superscript"/>
            AND citation number text.

  DO NOT use a single regex with `.*?` and `re.DOTALL` to match from <w:r> through
  superscript through </w:r> — this will match across run boundaries, causing field
  codes to wrap entire paragraphs of body text instead of just the citation numbers.
  The user will see whole paragraphs highlighted as field codes in Word, which is wrong.
  Only the superscript citation numbers should be inside field codes.
"""
import json
import re
import sys


def xml_escape(s):
    """Escape only <, >, & for XML text content."""
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def build_endnote_xml(ref_ids, refs_dict, display_text):
    """
    Build the EndNote XML that goes inside instrText.

    Structure:
      <EndNote>
        <Cite>
          <Author>LastName</Author>
          <Year>YYYY</Year>
          <RecNum>N</RecNum>
          <DisplayText><style face="superscript">N,M</style></DisplayText>  ← FIRST Cite only
          <record>
            <rec-number>N</rec-number>
            <foreign-keys><key app="EN" db-id="0">N</key></foreign-keys>
            <ref-type name="Journal Article">17</ref-type>
            <contributors><authors>...</authors></contributors>
            <titles>...</titles>
            ...
          </record>
        </Cite>
        <Cite>...</Cite>  ← subsequent cites, no DisplayText
      </EndNote>

    The DisplayText element is essential — without it, EndNote cannot render the
    citation when the user reformats references, causing document corruption.

    The <foreign-keys> and <style> wrappers on text fields are required for
    EndNote to recognize the record structure in its traveling library.
    """
    parts = ['<EndNote>']
    first = True
    for rid in ref_ids:
        ref = refs_dict.get(rid)
        if not ref:
            continue

        # Reference type mapping
        ref_type_num, ref_type_name = '17', 'Journal Article'
        # Extend this mapping as needed for books, book sections, etc.
        # Common types: 6=Book, 5=Book Section, 17=Journal Article

        first_author_last = ref['au'][0].split(',')[0] if ref.get('au') else ''
        year = str(ref.get('yr', ''))

        parts.append('<Cite>')
        parts.append(f'<Author>{first_author_last}</Author>')
        parts.append(f'<Year>{year}</Year>')
        parts.append(f'<RecNum>{rid}</RecNum>')

        # DisplayText only in the first Cite — this tells EndNote what to display
        if first:
            parts.append(f'<DisplayText><style face="superscript">{display_text}</style></DisplayText>')
            first = False

        # Record block with full metadata
        parts.append('<record>')
        parts.append(f'<rec-number>{rid}</rec-number>')
        parts.append(f'<foreign-keys><key app="EN" db-id="0">{rid}</key></foreign-keys>')
        parts.append(f'<ref-type name="{ref_type_name}">{ref_type_num}</ref-type>')

        # Authors — each wrapped in <style> for EndNote compatibility
        authors_xml = ''.join(
            f'<author><style face="normal" font="default" size="100%">{a}</style></author>'
            for a in ref.get('au', [])
        )
        parts.append(f'<contributors><authors>{authors_xml}</authors></contributors>')

        # Titles
        title = ref.get('ti', '')
        journal = ref.get('jo', '')
        parts.append(f'<titles><title><style face="normal" font="default" size="100%">{title}</style></title>')
        parts.append(f'<secondary-title><style face="normal" font="default" size="100%">{journal}</style></secondary-title></titles>')
        parts.append(f'<periodical><full-title><style face="normal" font="default" size="100%">{journal}</style></full-title></periodical>')

        # Volume, pages
        vol = str(ref.get('vol', ''))
        sp = str(ref.get('sp', ''))
        ep = str(ref.get('ep', ''))
        if vol:
            parts.append(f'<volume>{vol}</volume>')
        if sp and ep:
            parts.append(f'<pages>{sp}-{ep}</pages>')
        elif sp:
            parts.append(f'<pages>{sp}</pages>')

        # Year
        parts.append(f'<dates><year>{year}</year></dates>')

        # DOI
        doi = ref.get('doi')
        if doi:
            parts.append(f'<electronic-resource-num>{doi}</electronic-resource-num>')

        parts.append('</record>')
        parts.append('</Cite>')

    parts.append('</EndNote>')
    return ''.join(parts)


def parse_citation_text(text):
    """Parse citation text like "1,2", "3–5", "27,28" into list of integer ref IDs."""
    text = text.strip()
    ids = []
    for part in text.split(','):
        part = part.strip()
        range_match = re.match(r'(\d+)\s*[\u2013\-]\s*(\d+)', part)
        if range_match:
            s, e = int(range_match.group(1)), int(range_match.group(2))
            ids.extend(range(s, e + 1))
        elif part.isdigit():
            ids.append(int(part))
    return ids


def main():
    if len(sys.argv) < 3:
        print("Usage: python inject_endnote.py <document_xml_path> <refs_verified_json_path>")
        sys.exit(1)

    xml_path = sys.argv[1]
    refs_path = sys.argv[2]

    with open(refs_path, 'r') as f:
        refs_dict = {r['id']: r for r in json.load(f)}

    with open(xml_path, 'r', encoding='utf-8') as f:
        xml = f.read()

    # ═══════════════════════════════════════════════════════════════════
    # TWO-STEP APPROACH — find individual runs, then check each one
    # ═══════════════════════════════════════════════════════════════════
    # Step 1: Match each individual <w:r>...</w:r> block that has rPr and text
    run_pattern = re.compile(
        r'<w:r>\s*<w:rPr>.*?</w:rPr>\s*<w:t[^>]*>.*?</w:t>\s*</w:r>',
        re.DOTALL
    )

    # Step 2: Within a single run, check for superscript and citation text
    superscript_check = re.compile(r'<w:vertAlign w:val="superscript"/>')
    cite_text_extract = re.compile(r'<w:t[^>]*>([\d,\s\u2013\-]+)</w:t>')

    citation_count = 0
    replacements = []

    for m in run_pattern.finditer(xml):
        run_xml = m.group(0)

        # Only process runs with superscript formatting
        if not superscript_check.search(run_xml):
            continue

        # Only process runs whose text content is citation numbers
        text_match = cite_text_extract.search(run_xml)
        if not text_match:
            continue

        cite_text = text_match.group(1).strip()
        if not cite_text:
            continue

        ref_ids = parse_citation_text(cite_text)
        valid_ids = [rid for rid in ref_ids if rid in refs_dict]
        if not valid_ids:
            continue

        citation_count += 1

        # Extract rPr and create a non-superscript version for the field char runs
        rpr_match = re.search(r'<w:rPr>.*?</w:rPr>', run_xml, re.DOTALL)
        rpr = rpr_match.group() if rpr_match else ''
        rpr_no_super = re.sub(r'\s*<w:vertAlign[^/]*/>\s*', '', rpr)

        # Build the EndNote XML
        endnote_xml = build_endnote_xml(valid_ids, refs_dict, cite_text)
        escaped = xml_escape(endnote_xml)

        # Build field code wrapper around ONLY this single run
        replacement = (
            f'<w:r>{rpr_no_super}<w:fldChar w:fldCharType="begin"/></w:r>'
            f'<w:r>{rpr_no_super}<w:instrText xml:space="preserve"> ADDIN EN.CITE {escaped}</w:instrText></w:r>'
            f'<w:r>{rpr_no_super}<w:fldChar w:fldCharType="separate"/></w:r>'
            f'{run_xml}'
            f'<w:r>{rpr_no_super}<w:fldChar w:fldCharType="end"/></w:r>'
        )

        replacements.append((m.start(), m.end(), replacement))

    # Apply replacements in reverse order to preserve string positions
    for start, end, replacement in reversed(replacements):
        xml = xml[:start] + replacement + xml[end:]

    print(f"Wrapped {citation_count} citation runs with EN.CITE field codes")

    # ═══════════════════════════════════════════════════════════════════
    # Wrap reference list with ADDIN EN.REFLIST
    # ═══════════════════════════════════════════════════════════════════
    ref_match = re.search(r'<w:t[^>]*>References</w:t>', xml)
    if ref_match:
        p_start = xml.rfind('<w:p>', 0, ref_match.start())
        if p_start >= 0:
            rpr_field = ('<w:rPr>'
                         '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>'
                         '<w:sz w:val="24"/><w:szCs w:val="24"/>'
                         '</w:rPr>')

            field_begin = (
                f'<w:p><w:r>{rpr_field}<w:fldChar w:fldCharType="begin"/></w:r>'
                f'<w:r>{rpr_field}<w:instrText xml:space="preserve"> ADDIN EN.REFLIST </w:instrText></w:r>'
                f'<w:r>{rpr_field}<w:fldChar w:fldCharType="separate"/></w:r></w:p>'
            )
            xml = xml[:p_start] + field_begin + xml[p_start:]

            field_end = f'<w:p><w:r>{rpr_field}<w:fldChar w:fldCharType="end"/></w:r></w:p>'
            body_end = xml.rfind('</w:body>')
            if body_end >= 0:
                xml = xml[:body_end] + field_end + xml[body_end:]
                print("Wrapped reference list with EN.REFLIST field code")

    with open(xml_path, 'w', encoding='utf-8') as f:
        f.write(xml)
    print("Done")


if __name__ == '__main__':
    main()
