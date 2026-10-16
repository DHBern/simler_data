<?xml version="1.0" encoding="UTF-8"?>
<schema xmlns="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
   <title>ISO Schematron rules</title>
   <!-- This file generated 2026-10-15T15:37:06Z by 'extract-isosch.xsl'. -->
   <!-- ********************* -->
   <!-- namespaces, declared: -->
   <!-- ********************* -->
   <ns prefix="tei" uri="http://www.tei-c.org/ns/1.0"/>
   <ns prefix="xs" uri="http://www.w3.org/2001/XMLSchema"/>
   <ns prefix="rng" uri="http://relaxng.org/ns/structure/1.0"/>
   <ns prefix="rna" uri="http://relaxng.org/ns/compatibility/annotations/1.0"/>
   <ns prefix="sch" uri="http://purl.oclc.org/dsdl/schematron"/>
   <ns prefix="sch1x" uri="http://www.ascc.net/xml/schematron"/>
   <!-- ******************************************************* -->
   <!-- constraints in en, und, mul, zxx, of which there are 42 -->
   <!-- ******************************************************* -->
   <pattern id="schematron-constraint-att-datable-w3c-when-1">
      <rule context="tei:*[@when]">
         <report test="@notBefore|@notAfter|@from|@to" role="nonfatal">The @when attribute cannot be used with any other att.datable.w3c attributes.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-att-datable-w3c-from-2">
      <rule context="tei:*[@from]">
         <report test="@notBefore" role="nonfatal">The @from and @notBefore attributes cannot be used together.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-att-datable-w3c-to-3">
      <rule context="tei:*[@to]">
         <report test="@notAfter" role="nonfatal">The @to and @notAfter attributes cannot be used together.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-rendition-order-4">
      <rule context="tei:*[@rendition]">
         <let name="order"
              value="('#aq', '#fr', '#b', '#i', '#c', '#right', '#g', '#k', '#u', '#in', '#sup', '#sub', '#larger', '#smaller', '#et', '#et2', '#et3', '#hr', '#twocol', '#acrostic', '#acroInit', '#acroFin')"/>
         <let name="t" value="tokenize(normalize-space(@rendition), ' ')"/>
         <let name="sorted"
              value="string-join((for $o in $order return $o[. = $t], distinct-values($t[not(. = $order)])), ' ')"/>
         <report role="warning" test="string(@rendition) ne $sorted">[S-REN] @rendition="<value-of select="@rendition"/>" should read "<value-of select="$sorted"/>": its tokens once, in the order of tagsDecl, single-spaced (a token tagsDecl does not declare stays at the end; the schema rejects it).</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-rendition-letter-5">
      <rule context="tei:*[not(self::tei:hi)][@rendition]">
         <report role="warning"
                 test="tokenize(@rendition, '\s+') = ('#in', '#sup', '#sub', '#acroInit', '#acroFin')">[S-REP] @rendition="<value-of select="@rendition"/>" on &lt;<name/>&gt;: an initial, superscript, subscript or acrostic letter (#in, #sup, #sub, #acroInit, #acroFin) is marked on the hi that holds the letters.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-targetLang-6">
      <rule context="tei:*[not(self::tei:schemaSpec)][@targetLang]">
         <assert test="@target">@targetLang should only be used on &lt;<name/>&gt; if @target is specified.</assert>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-subtypeTyped-7">
      <rule context="tei:*[@subtype]">
         <assert test="@type"> The &lt;<name/>&gt; element should not be categorized in detail with @subtype unless also categorized in general with @type.</assert>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-abstractModel-structure-p-in-ab-or-p-8">
      <rule context="tei:p">
         <report test="(ancestor::tei:ab or ancestor::tei:p) and                        not( ancestor::tei:floatingText                           | parent::tei:exemplum                           | parent::tei:item                           | parent::tei:note                           | parent::tei:q                           | parent::tei:quote                           | parent::tei:remarks                           | parent::tei:said                           | parent::tei:sp                           | parent::tei:stage                           | parent::tei:cell                           | parent::tei:figure )"> Abstract model violation: Paragraphs may not occur inside other paragraphs or &lt;ab&gt; elements.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-abstractModel-structure-p-in-l-9">
      <rule context="tei:l//tei:p">
         <assert test="ancestor::tei:floatingText | parent::tei:figure | parent::tei:note"> Abstract model violation: Metrical lines (&lt;l&gt; elements) may not contain higher-level structural elements such as &lt;div&gt;, &lt;p&gt;, or &lt;ab&gt;, unless &lt;p&gt; is a child of &lt;figure&gt; or &lt;note&gt;, or is a descendant of &lt;floatingText&gt;.</assert>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-hi-block-rendition-10">
      <rule context="tei:hi[tokenize(@rendition, '\s+') = ('#c', '#right', '#et', '#et2', '#et3', '#hr', '#twocol', '#acrostic')]">
         <report role="warning" test="true()">[S-HI] Alignment, indent and the other block renditions (#c, #right, #et, #et2, #et3, #hr, #twocol, #acrostic) belong on the enclosing block (head, p, l, lg, milestone, …), not on hi.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-hi-spanning-rendition-11">
      <rule context="tei:hi[@rendition][ancestor::tei:text]">
         <report role="warning"
                 test="parent::tei:*[local-name() = ('head', 'p', 'ab', 'signed', 'salute', 'closer', 'opener', 'dateline', 'byline', 'postscript', 'argument', 'epigraph', 'trailer', 'docTitle', 'titlePart', 'docAuthor', 'docEdition', 'docImprint', 'l', 'lg', 'label', 'speaker', 'stage', 'item', 'cell', 'note', 'fw')] and not(../text()[normalize-space()]) and count(../*[not(self::tei:lb or self::tei:pb or self::tei:cb or self::tei:milestone or self::tei:anchor or self::tei:space or self::tei:gap)]) = 1 and count(@*) = 1 and node() and not(tokenize(@rendition, '\s+') = ('#in', '#sup', '#sub', '#acroInit', '#acroFin'))">[S-HIB] This hi covers the whole &lt;<value-of select="local-name(..)"/>&gt;: its rendition belongs on the &lt;<value-of select="local-name(..)"/>&gt; (merged with the block's own, in tagsDecl order), and the hi can go.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-hi-adjacent-12">
      <rule context="tei:hi[@rendition][count(@*) = 1][ancestor::tei:text][not(tokenize(@rendition, '\s+') = ('#in', '#sup', '#sub', '#acroInit', '#acroFin'))]">
         <report role="warning"
                 test="let $n := following-sibling::*[not(self::tei:lb)][1] return $n[self::tei:hi][count(@*) = 1][@rendition = current()/@rendition] and exists(following-sibling::tei:lb[. &lt;&lt; $n]) and not(following-sibling::node()[. &lt;&lt; $n][self::comment() or self::processing-instruction() or self::text()[normalize-space()] or self::*[not(self::tei:lb)] or self::tei:lb[*]]) and string-length(normalize-space(.)) gt 1 and string-length(normalize-space($n)) gt 1 and (every $b in following-sibling::tei:lb[. &lt;&lt; $n] satisfies $b/@break = 'no' or ancestor::*[not(self::tei:hi)][1][local-name() = ('head', 'l', 'p', 'signed', 'closer', 'salute', 'dateline', 'byline', 'trailer', 'titlePart', 'docTitle', 'docAuthor', 'docImprint', 'docEdition', 'label', 'item')])">[S-HIA] The next hi has the same rendition and only line ends stand between: one hi across them.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-hi-nesting-13">
      <rule context="tei:hi[@rendition][ancestor::tei:text]">
         <report role="warning"
                 test="parent::tei:hi and not(../text()[normalize-space()]) and count(../*[not(self::tei:lb or self::tei:pb or self::tei:cb or self::tei:milestone or self::tei:anchor or self::tei:space or self::tei:gap)]) = 1 and count(@*) = 1">[S-HIN] This hi is the whole content of its parent hi: one hi with both renditions (<value-of select="../@rendition"/>
            <value-of select="@rendition"/>).</report>
         <report role="warning"
                 test="some $t in tokenize(normalize-space(@rendition), ' ') satisfies $t = (for $a in ancestor::*[@rendition] return tokenize(normalize-space($a/@rendition), ' '))">[S-HIR] A token of this hi (<value-of select="@rendition"/>) is already on an ancestor: leave it out.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-choice-order-14">
      <rule context="tei:choice">
         <report role="warning"
                 test="tei:corr[following-sibling::tei:sic] or tei:expan[following-sibling::tei:abbr]">[S-CHO] In choice the source reading comes first: sic before corr, abbr before expan.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-rs-key-15">
      <rule context="tei:rs">
         <let name="register"
              value="if (@type = 'org') then 'institution' else if (@type = 'bibl') then 'work' else string(@type)"/>
         <assert test="every $key in tokenize(normalize-space(@key), ' ') satisfies matches($key, concat('^', $register, '_\d+$'))">[S-RK] "<value-of select="@key"/>" is not a list of keys of the <value-of select="$register"/> register.</assert>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-refAtts-16">
      <rule context="tei:ref">
         <report test="@target and @cRef">Only one of the attributes @target and @cRef may be supplied on &lt;<name/>&gt;.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-gloss-list-must-have-labels-17">
      <rule context="tei:list[@type='gloss']">
         <assert test="tei:label"> The content of a "gloss" list should include a sequence of one or more pairs of a &lt;label&gt; element followed by an &lt;item&gt; element.</assert>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-note-range-18">
      <rule context="tei:note[@targetEnd]">
         <let name="id" value="replace(@targetEnd, '^#', '')"/>
         <assert test="preceding::tei:anchor[@xml:id = $id]">[S-NR] targetEnd names no preceding anchor.</assert>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-note-type-19">
      <rule context="tei:note[not(@targetEnd)]">
         <assert role="warning" test="@type">[S-NT] A note without targetEnd needs a type.</assert>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-lb-line-end-placement-20">
      <rule context="tei:lb[not(@break='no')]">
         <let name="last"
              value="not(following-sibling::node()[self::* or self::text()[normalize-space()]])"/>
         <let name="prev"
              value="preceding-sibling::node()[self::* or self::text()[normalize-space()]][1]"/>
         <report role="warning"
                 test="$last and not($prev[self::tei:lg]) and (parent::tei:l or parent::tei:head                       or parent::tei:p or parent::tei:list or parent::tei:item or parent::tei:hi                       or parent::tei:closer or parent::tei:salute or parent::tei:signed                       or parent::tei:dateline or parent::tei:titlePart or parent::tei:figure                       or parent::tei:fw or parent::tei:body or parent::tei:front)">[S-LB] A line break (lb) marks a line END and follows the element that holds the line; here it is the last child of &lt;<value-of select="local-name(parent::*)"/>&gt;. Move it to immediately after &lt;/<value-of select="local-name(parent::*)"/>&gt;.</report>
         <report role="warning"
                 test="$last and parent::tei:lg and preceding-sibling::node()[self::* or self::text()[normalize-space()]][not(self::tei:note)][1][self::tei:l]">[S-LBV] The line end of a stanza's last verse follows the stanza: move this lb to immediately after &lt;/lg&gt;.</report>
         <report role="warning"
                 test="$prev[not(self::tei:lb)]/descendant::node()[self::* or self::text()[normalize-space()]][last()][self::tei:lb[not(@break='no')]]">[S-LB2] The line before this lb already ends with an lb inside the preceding &lt;<value-of select="local-name($prev)"/>&gt;: nothing is printed between the two, so this one is a doubling (or an empty line, which is not encoded).</report>
         <report role="warning" test="$prev[self::tei:div]">[S-LBD] The line end of a unit's last line belongs to the unit: move this lb before &lt;/div&gt;.</report>
         <report role="warning"
                 test="$prev[self::tei:lg][node()[self::* or self::text()[normalize-space()]][not(self::tei:note[preceding-sibling::node()[self::* or self::text()[normalize-space()]][1][self::tei:l]])][last()][not(self::tei:l or self::tei:lb)]]">[S-LBG] This lb ends the last line of the preceding &lt;lg&gt;, a line held by its last child &lt;<value-of select="local-name($prev/*[last()])"/>&gt;: move the lb inside, directly after &lt;/<value-of select="local-name($prev/*[last()])"/>&gt;.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-lb-line-end-placement-21">
      <rule context="(tei:l | tei:p | tei:head | tei:closer)[not(ancestor::tei:note)]">
         <let name="next"
              value="following::node()[self::* or self::text()[normalize-space()]][1]"/>
         <let name="end"
              value="(descendant::node()[self::* or self::text()[normalize-space()]])[last()]"/>
         <report role="warning"
                 test="$next[self::tei:div or self::tei:lg] and not($end[self::tei:lb])                       and replace(replace(string(.), '\$[^$]*\$', ''), '[\s\p{Z}]', '') ne ''">[S-LBM] The line of this &lt;<value-of select="local-name()"/>&gt; ends before a new &lt;<value-of select="local-name($next)"/>&gt;, but its line end is not marked: add an lb after it (after the stanza's &lt;/lg&gt; for a verse).</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-lb-joined-22">
      <rule context="tei:lb[@break='no']">
         <report role="warning"
                 test="not(preceding-sibling::node()[normalize-space() or self::*])">[S-LBJ] A joined line end opens its element.</report>
         <report role="warning"
                 test="preceding-sibling::*[1][self::tei:fw[@type='catch']]">[S-LBC] The line of a catchword ends with a plain lb.</report>
         <report role="warning"
                 test="(preceding-sibling::node()[1][self::text()][matches(., '\s$')] or following-sibling::node()[1][self::text()][matches(., '^\s')]) and (not(parent::tei:lg or parent::tei:div or parent::tei:body or parent::tei:front or parent::tei:back) or preceding-sibling::node()[1][self::text()[normalize-space()]] or following-sibling::node()[1][self::text()[normalize-space()]]) and preceding-sibling::node()[not(self::text()[not(normalize-space())])][1][self::text() or self::tei:hi or self::tei:supplied or self::tei:choice or self::tei:sic or self::tei:corr or self::tei:orig or self::tei:reg or self::tei:abbr or self::tei:expan or self::tei:unclear or self::tei:rs or self::tei:num or self::tei:foreign or self::tei:g] and following-sibling::node()[not(self::text()[not(normalize-space())])][1][self::text() or self::tei:hi or self::tei:supplied or self::tei:choice or self::tei:sic or self::tei:corr or self::tei:orig or self::tei:reg or self::tei:abbr or self::tei:expan or self::tei:unclear or self::tei:rs or self::tei:num or self::tei:foreign or self::tei:g]">[S-LBW] Whitespace next to a joined line end splits the word in plain text: write er-&lt;lb break="no"/&gt;weißt (a line break may stand inside the tag: &lt;lb⏎ break="no"/&gt;). If the two words are separate, the line end is a plain lb instead. Next to page furniture, an anchor or another verse this is not checked.</report>
         <report role="warning"
                 test="matches(string-join(following-sibling::node()[position() le 2] ! string(), ''), '^\s*und([\s/.,:;!?]|$)', 'i')">[S-LBU] The next word is "und": the hyphen ends a word (Geburt- und Sterb-Getichte), so the line end is a plain lb.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-lb-joined-23">
      <rule context="tei:lb[not(@break)]">
         <let name="end"
              value="(preceding-sibling::node()[normalize-space()][1]/descendant-or-self::text()[normalize-space()])[last()]"/>
         <report role="warning"
                 test="matches($end, '(^|[^-])[-¬⸗­‐‑]\s*$')                     and not($end/ancestor::tei:fw or $end/ancestor::*[@next])                     and not(matches(following-sibling::node()[normalize-space()][1], '^\s*(und|oder)([\s/.,:;!?]|$)', 'i'))">[S-LBH] A hyphen ends the line, but the line end is not joined: if the word continues, write lb break="no"; if the hyphen ends a word, nothing is to be done.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-cb-set-24">
      <rule context="tei:cb">
         <let name="open" value="preceding::tei:cb[@type][1]/@type = 'start'"/>
         <report test="@type = 'start' and not(following::tei:cb[@type][1]/@type = 'end')">[S-CBS] A column set without its end (cb type="end").</report>
         <report test="not(@type = 'start') and not($open)">[S-CBS] A column break outside a column set (cb type="start" … cb type="end").</report>
         <report role="warning"
                 test="not(@type) and $open and not(preceding::text()[normalize-space()][1] &gt;&gt; preceding::tei:cb[@type][1])">[S-CBF] The first column needs no cb of its own.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-cb-set-25">
      <rule context="tei:pb | tei:fw[@place = 'bottom']">
         <report test="preceding::tei:cb[@type][1]/@type = 'start'">[S-CBP] A column set ends on its page: cb type="end" before the page's foot, cb type="start" after the next page's head.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-line-inner-space-26">
      <rule context="tei:text//tei:l | tei:text//tei:head | tei:text//tei:p">
         <report role="warning"
                 test="node()[1][self::text()][matches(., '^[ &#x9;]+([^\s]|$)')] or node()[last()][self::text()][matches(., '[^\s][ &#x9;]+$')]">[S-WS] A space directly after &lt;<name/>&gt; or before &lt;/<name/>&gt;: leave it out.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-abstractModel-structure-l-in-l-27">
      <rule context="tei:l">
         <report test="ancestor::tei:l[not(.//tei:note//tei:l[. = current()])]">Abstract model violation: Metrical lines (&lt;l&gt; elements) may not contain &lt;l&gt; or &lt;lg&gt; elements.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-lg-type-28">
      <rule context="tei:lg[@type]">
         <report role="warning" test="ancestor::tei:lg">[S-LGN] An lg inside an lg has no @type (here "<value-of select="@type"/>"): a stanza or a section is told by its nesting.</report>
         <report role="warning" test="not(ancestor::tei:lg) and @type ne 'poem'">[S-LGV] @type="<value-of select="@type"/>": the lg that holds a whole poem is type="poem". A stanza standing outside its poem's lg needs that lg round it.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-atleast1oflggapl-29">
      <rule context="tei:lg">
         <assert test="count(descendant::tei:lg|descendant::tei:l|descendant::tei:gap) &gt; 0">An &lt;lg&gt; element must contain at least one child &lt;l&gt;, &lt;lg&gt;, or &lt;gap&gt; element.</assert>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-abstractModel-structure-lg-in-l-30">
      <rule context="tei:lg">
         <report test="ancestor::tei:l[not(.//tei:note//tei:lg[. = current()])]">Abstract model violation: Lines may not contain line groups.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-div-type-31">
      <rule context="tei:div[@type = 'poem-div']">
         <report role="warning" test="true()">[S-DIVT] div/@type="poem-div" is not used: leave the type out (a group or a voice part needs none; a single poem is type="poem").</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-abstractModel-structure-div-in-l-32">
      <rule context="tei:l//tei:div">
         <assert test="ancestor::tei:floatingText"> Abstract model violation: Metrical lines (&lt;l&gt; elements) may not contain higher-level structural elements such as &lt;div&gt;, unless &lt;div&gt; is a descendant of &lt;floatingText&gt;.</assert>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-abstractModel-structure-div-in-ab-or-p-33">
      <rule context="tei:div">
         <report test="(ancestor::tei:p or ancestor::tei:ab) and not(ancestor::tei:floatingText)"> Abstract model violation: &lt;p&gt; and &lt;ab&gt; may not contain higher-level structural elements such as &lt;div&gt;, unless &lt;div&gt; is a descendant of &lt;floatingText&gt;.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-one_ms_singleton_max-34">
      <rule context="tei:msContents|tei:physDesc|tei:history|tei:additional">
         <let name="gi" value="name(.)"/>
         <report test="preceding-sibling::*[ name(.) eq $gi ]                           and                           not( following-sibling::*[ name(.) eq $gi ] )"> Only one &lt;<name/>&gt; is allowed as a child of &lt;<value-of select="name(..)"/>&gt;.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-msId_minimal-35">
      <rule context="tei:msIdentifier">
         <report test="not( parent::tei:msPart )                           and                           ( child::*[1]/self::idno  or  child::*[1]/self::altIdentifier  or  normalize-space(.) eq '')">An &lt;msIdentifier&gt; must contain either a &lt;repository&gt; or &lt;location&gt;.</report>
      </rule>
   </pattern>
   <pattern id="schematron-constraint-anchor-note-36">
      <rule context="tei:anchor[@xml:id]">
         <let name="id" value="@xml:id"/>
         <assert role="warning"
                 test="following::tei:note[replace(@targetEnd, '^#', '') = $id]">[S-AN] No note comments the range this anchor starts.</assert>
      </rule>
   </pattern>
</schema>
