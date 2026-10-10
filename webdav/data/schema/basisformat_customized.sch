<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="http://www.schematron.com/iso/iso-schematron.rnc" type="application/relax-ng-compact-syntax"?>
<schema xmlns="http://purl.oclc.org/dsdl/schematron" queryBinding="xslt2">
    <title>Schematron extension of the DTA ›Base Format‹ (DTABf)</title>
    <!-- This document contains the Schematron extension of the DTA ›Base Format‹ (DTABf).
    Version: 1.1.0 (January 10, 2020).
    First published: November 5, 2014.
    Author: Susanne Haaf.
    Publisher: Deutsches Textarchiv (Matthias Boenig, Alexander Geyken, Susanne Haaf, Bryan Jurish, 
        Christian Thomas, Frank Wiegand), Berlin-Brandenburg Academy of Sciences and Humanities (BBAW), 
        Jägerstr. 22/23, 10117 Berlin. 
    Licence: Distributed under the Creative Commons Attribution-NonCommercial 3.0 Unported License 
        (CC by-NC; http://creativecommons.org/licenses/by-nc/3.0/de/). -->
    
    <ns prefix="tei" uri="http://www.tei-c.org/ns/1.0"/>
    <ns prefix="xs" uri="http://www.w3.org/2001/XMLSchema"/>

    <pattern id="pipeCharacter">
        <rule context="tei:*">
            <report test="text()[contains(., '|')]" role="WARNING">
                [W0007] The uncommon character '|' has been used within the text area.
            </report>
        </rule>
    </pattern>

    <pattern id="allElements">
        <rule context="tei:*[not(self::tei:hi)]">
            <report test="@rendition and @rend" role="WARNING">
                [W0001] The usage of @rend or @rendition should be exclusionary.
            </report>
        </rule>
    </pattern>

    <pattern id="allTextNodes">
        <rule context="text()[contains(., '@')]">
            <report test="ancestor::tei:text" role="WARNING">
                [W0002] The uncommon character '@' has been used within the text area.
            </report>
        </rule>
    </pattern>

    <pattern id="biblElement">
        <rule context="tei:bibl">
            <report test="parent::tei:quote" role="ERROR">
                [E0003] Element "<name/>" not allowed within element "quote".
            </report>
            <assert test="child::* or child::text()[normalize-space(.)]" role="ERROR">
                [E0004] Element "<name/>" may not be empty.
            </assert>
            <report test=".[@type][ancestor::tei:text]">
                [E0033] Attribute @type in element "<name/>" not allowed within the //text area. 
            </report>
        </rule>
    </pattern>

    <pattern id="capitalLetterI">
        <let name="x" value="(//tei:*[contains(@rendition,'#aq')] or //tei:*[contains(@rendition, '#fr')]) and //tei:text//text()[not(ancestor::tei:*[contains(@rendition,'#aq')])][not(ancestor::tei:note[@type='editorial'])][contains(., 'I')]"/>
        <rule context="//tei:TEI">
            <report test="$x" role="WARNING">
                [W0004] The document contains capital letter I within Fraktur text. Should be capital letter J? 
                Search for XPath //text//text()[not(ancestor::*[contains(@rendition,'#aq')])][contains(., 'I')] 
                to find all text nodes with incorrect instances of capital 'I' within the document. 
            </report>
        </rule>
    </pattern>

    <pattern id="choiceElement">
        <rule context="tei:choice">
            <assert test="count(*) > 1" role="ERROR">
                [E0005] Element "<name/>" must have at least two child elements.
            </assert>
        </rule>
    </pattern>

    <pattern id="choiceSubelements">
        <rule context="tei:corr | tei:expan | tei:reg | tei:sic">
            <assert test="parent::tei:choice" role="ERROR">
                [E0013] Element "<name/>" must have a parent element "choice".
            </assert>
        </rule>
    </pattern>

    <pattern id="corrElement">
        <rule context="tei:corr">
            <assert test="count(preceding-sibling::tei:sic | following-sibling::tei:sic) = 1" role="ERROR">
                [E0006] Element "<name/>" must have exactly one corresponding "sic" element.
            </assert>
        </rule>
    </pattern>

    <pattern id="correspAttribute">
        <rule context="tei:*[@corresp]">
            <assert test="matches(@corresp, '^#|^https?://')" role="ERROR">
                [E0028] The value of attribute @corresp must be a URL or same document reference 
                starting with 'http://' or 'https://' or '#'.
            </assert>
            <assert test="if (starts-with(@corresp, '#')) then //@xml:id = substring-after(@corresp, '#') else 1" role="error">
                [E0026] The value of attribute @corresp must have a corresponding @xml:id-value within the same document.
            </assert>
        </rule>
    </pattern>
    
    <pattern id="divTypeAdvertisement">
        <rule context="tei:div[@type='advertisement']">
            <report test="preceding::tei:div[@type[matches(., '^j[A-Z]')]] | following::tei:div[@type[matches(., 'j[A-Z]')]] | 
                ancestor::tei:div[@type[matches(., 'j[A-Z]')]] | descendant::tei:div[@type[matches(., 'j[A-Z]')]]" role="ERROR">
                [E0027] Value @type="advertisement" in element "div" not allowed within newspapers or journals; 
                expected values are "jAnnouncements" or "jAn".
            </report>
        </rule>
    </pattern>
    
    <pattern id="expanElement">
        <rule context="tei:expan">
            <assert test="count(preceding-sibling::tei:abbr | following-sibling::tei:abbr) = 1" role="ERROR">
                [E0007] Element "<name/>" must have exactly one corresponding "abbr" element.
            </assert>
        </rule>
    </pattern>

    <!--<pattern id="facsInsideFirstPagebreak">
        <rule context="tei:pb[1][not(preceding::tei:pb)]">
            <assert test="@facs[matches(., '^#f0001$')]" role="ERROR">
                [E0015] Value of @facs within first "pb" incorrect; expected value: #f0001. 
            </assert>
        </rule>
    </pattern>

    <pattern id="facsInsidePagebreaks">
        <rule context="tei:pb[@facs]">
            <assert test="if (matches(@facs, '^#f\d\d\d\d') and matches(preceding::tei:pb[1]/@facs, '^#f\d\d\d\d') and (preceding::tei:pb)) then xs:integer(substring(@facs, 3)) = preceding::tei:pb[1]/xs:integer(substring(@facs, 3)) +1 else 1" role="ERROR">
                [E0014] Value of @facs within "pb" incorrect; @facs-values of "pb"-elements have 
                to increase by 1 continually starting with #f0001.
            </assert>
        </rule>
    </pattern>

    <pattern id="facsOutsidePagebreaks">
        <rule context="tei:*[@facs][not(self::tei:pb)]">
            <assert test="matches(@facs, '^#|^https?://')" role="ERROR">
                [E0016] The value of attribute @facs must be a URL or same document reference 
                starting with 'http://' or 'https://' or '#'.
            </assert>
        </rule>
    </pattern>-->
    
    <pattern id="fwHeader">
        <rule context="tei:fw[@type='header']">
            <report test="string(preceding::tei:pb[1]/@facs) = string(following::tei:fw[@type='header'][1]/preceding::tei:pb[1]/@facs)" role="ERROR">
                [E0002] Each page may only contain one header.
            </report>
        </rule>
    </pattern>

    <pattern id="hiRendRendition">
        <rule context="tei:hi">
            <report test="(@rendition and @rend) and @rendition!='#none'" role="WARNING">
                [W0006] The attribute @rend in "<name/>" should be accompanied by an attribute-value-pair @rendition="#zero".
            </report>
        </rule>
    </pattern>

    <pattern id="kValueInRenditionAttribute">
        <rule context="tei:*[@rendition='#k']">
            <report test="contains(self::tei:*, 'ſ')" role="ERROR">
                [E0018] Long s not allowed within small capitals area.
            </report>
        </rule>
    </pattern>

    <pattern id="metamark">
        <rule context="tei:metamark[@function | @place]">
            <assert test="@function and @place" role="ERROR">
                [E0034] Element "<name/>" must contain both attributes @function and @place or neither.</assert>
        </rule>
    </pattern>

    <pattern id="nextAttribute">
        <rule context="tei:*[@next]">
            <assert test="starts-with(@next, '#')" role="ERROR">
                [E0017] The value of attribute @next must be a same document reference starting with '#'.
            </assert>
            <assert test="if (starts-with(@next, '#')) then //@xml:id = substring-after(@next, '#') else 1" role="error">
                [E0019] The value of attribute @next must have a corresponding @xml:id-value within the same document.
            </assert>
        </rule>
    </pattern>
    
    <pattern id="noteElement">
        <rule context="tei:note">
            <assert test="@type or @place" role="ERROR">
                [E0035] Element "<name/>" must contain an attribute @place or @type.
            </assert>
            <report test="preceding::bibl[@type!='MAN'] and @resp and not(@type='editorial')" role="ERROR">
                [E0036] Element "<name/>" must contain an attribute @place or @type.
            </report>
        </rule>
    </pattern>

    <pattern id="pbElement">
        <!--<rule context="tei:pb">
            <assert test="@facs[matches(., '#f[0-9]{4}')] and @facs[matches(., '^#f0*([1-9][0-9]*)$')]" role="ERROR">
                [E0008] Wrong format of @facs-value in element "<name/>"; should be "#f" followed by 4 digits (0-9) starting with 
                #f0001 and increasing by 1 continually. 
            </assert>
        </rule>-->
    </pattern>

    <pattern id="prevAttribute">
        <rule context="tei:*[@prev]">
            <assert test="starts-with(@prev, '#')" role="ERROR">
                [E0025] The value of attribute @prev must be a same document reference starting with '#'.
            </assert>
            <assert test="if (starts-with(@prev, '#')) then //@xml:id = substring-after(@prev, '#') else 1" role="error">
                [E0021] The value of attribute @prev must have a corresponding @xml:id-value within the same document.
            </assert>
        </rule>
    </pattern>
    
    <pattern id="regElement">
        <rule context="tei:reg">
            <assert test="count(preceding-sibling::tei:orig | following-sibling::tei:orig) = 1" role="ERROR">
                [E0009] Element "<name/>" must have exactly one corresponding "orig" element.
            </assert>
        </rule>
    </pattern>

    <pattern id="respElement">
        <rule context="tei:resp">
            <assert test="child::tei:*" role="ERROR">
                [E0010] Element "<name/>" must have at least one child element.
            </assert>
            <report test="child::text()[normalize-space(.)]" role="ERROR">
                [E0011] Text not allowed here; expected child element or closing tag.
            </report>
        </rule>
    </pattern>

    <pattern id="salute">
        <rule context="tei:salute">
            <assert test="ancestor::tei:opener|ancestor::tei:closer">
                [E0030] The element "salute" may only occur within the elements "opener" or "closer".
            </assert>
        </rule>
    </pattern>
    
    <pattern id="sameAsAttribute">
        <rule context="tei:*[@sameAs]">
            <assert test="starts-with(@sameAs, '#')" role="ERROR">
                [E0022] The value of attribute @sameAs must be a same document reference starting with '#'.
            </assert>
            <assert test="if (starts-with(@sameAs, '#')) then //@xml:id = substring-after(@sameAs, '#') else 1" role="error">
                [E0023] The value of attribute @sameAs must have a corresponding @xml:id-value within the same document.
            </assert>
        </rule>
    </pattern>

    <pattern id="sicElement">
        <rule context="tei:sic">
            <assert test="count(preceding-sibling::tei:corr | following-sibling::tei:corr) = 1" role="ERROR">
                [E0012] Element "<name/>" must have exactly one corresponding "corr" element.
            </assert>
        </rule>
    </pattern>

    <pattern id="signed">
        <rule context="tei:signed">
            <assert test="ancestor::tei:closer">
                [E0029] The element "signed" may only occur within the element "closer".
            </assert>
        </rule>
    </pattern>
	
		<pattern id="subst">
			<rule context="tei:subst">
				<assert test="child::tei:add and child::tei:del">
					[E0037] The element "subst" must contain both elements "add" and "del" as child elements.
				</assert>
			</rule>
		</pattern>

    <pattern id="targetAttribute">
        <rule context="tei:*[@target]">
            <assert test="matches(@target, '^#|^https?://')" role="ERROR">
                [E0024] The value of attribute @target must be a URL or same document 
                reference starting with 'http://' or 'https://' or '#' or '#f'.
            </assert>
            <assert test="if (starts-with(@target, '#') and not(starts-with(@target, '#f'))) then //@xml:id = substring-after(@target, '#') else 1" role="error">
                [E0032] Value of attribute @target must have a corresponding @xml:id-value within the same document.
            </assert>
            <assert test="if (starts-with(@target, '#f')) then //tei:pb/@facs = //./@target else 1" role="error">
                [E0020] Value of attribute @target must have a corresponding @facs-value 
                within a &lt;pb&gt; element in the same document.
            </assert>
            <assert test="if (. = tei:licence) then starts-with(@target, 'https?://') else 1" role="error">
                [E0031] Value of attribute @target must have a corresponding @facs-value 
                within a pb-element in the same document.
            </assert>
        </rule>
    </pattern>

    <pattern id="teiHeaderElements">
        <rule context="tei:addName | tei:address | tei:addrLine | tei:email | tei:biblFull | tei:country | 
            tei:forename | tei:genName | tei:measure | tei:msDesc | tei:nameLink | tei:publicationStmt | 
            tei:resp | tei:respStmt | tei:roleName | tei:surname | tei:titleStmt | tei:title">
            <report test="ancestor::tei:text" role="ERROR">
                [E0001] Element "<name/>" not allowed anywhere within element "text".
            </report>
        </rule>
    </pattern>
    
    <pattern id="tironianSignEtInText">
        <rule context="text()[contains(., '&#x204A;')]">
            <report test="ancestor::tei:text" role="WARNING">
                [W0003] The Unicode character 'U+204A' (Tironian sign et) has been used; check, if the source character is 'U+A75B' (Latin small letter r rotunda) instead.
            </report>
        </rule>
    </pattern>

    <pattern id="underbar">
        <rule context="text()[contains(.,'_ _')]">
            <report test="ancestor::tei:text" role="WARNING">
                [W0008] The string "_ _" has been used; check, if this is an adequate transcription of the source.
            </report>
        </rule>
    </pattern>
    
    <pattern id="values">
        <rule context="tei:*">
            <report test="@*=''" role="WARNING">
                [W0005] Attribute values may not be the empty string.
            </report>
        </rule>
    </pattern>
    
    <!-- Simler: the line end of an element's last line follows the element that holds the
         line and stays inside every further ancestor (schema/tei_simler.odd, lb-line-end-placement;
         applied by sonstige_transformationen/homogenize-closing-lb.py). -->
    <pattern id="lbLineEnd">
        <rule context="tei:lb[not(@break='no')]">
            <let name="last" value="not(following-sibling::node()[self::* or self::text()[normalize-space()]])"/>
            <let name="prev" value="preceding-sibling::node()[self::* or self::text()[normalize-space()]][1]"/>
            <report test="$last and not($prev[self::tei:lg]) and (parent::tei:l or parent::tei:head
                or parent::tei:p or parent::tei:list or parent::tei:item or parent::tei:hi
                or parent::tei:closer or parent::tei:salute or parent::tei:signed
                or parent::tei:dateline or parent::tei:titlePart or parent::tei:figure
                or parent::tei:fw or parent::tei:body or parent::tei:front)" role="WARNING">
                [S-LB] A line break (lb) marks a line END and follows the element that holds the line; here it is the last child of &lt;<value-of select="local-name(parent::*)"/>&gt;. Move it to immediately after &lt;/<value-of select="local-name(parent::*)"/>&gt;.
            </report>
            <report test="$last and parent::tei:lg and preceding-sibling::node()[self::* or self::text()[normalize-space()]][not(self::tei:note)][1][self::tei:l]" role="WARNING">
                [S-LBV] The line end of a stanza's last verse follows the stanza: move this lb to immediately after &lt;/lg&gt;.
            </report>
            <report test="$prev[not(self::tei:lb)]/descendant::node()[self::* or self::text()[normalize-space()]][last()][self::tei:lb[not(@break='no')]]" role="WARNING">
                [S-LB2] The line before this lb already ends with an lb inside the preceding &lt;<value-of select="local-name($prev)"/>&gt;: nothing is printed between the two, so this one is a doubling (or an empty line, which is not encoded).
            </report>
            <report test="$prev[self::tei:div]" role="WARNING">
                [S-LBD] The line end of a unit's last line belongs to the unit: move this lb before &lt;/div&gt;.
            </report>
            <report test="$prev[self::tei:lg][node()[self::* or self::text()[normalize-space()]][not(self::tei:note[preceding-sibling::node()[self::* or self::text()[normalize-space()]][1][self::tei:l]])][last()][not(self::tei:l or self::tei:lb)]]" role="WARNING">
                [S-LBG] This lb ends the last line of the preceding &lt;lg&gt;, a line held by its last child &lt;<value-of select="local-name($prev/*[last()])"/>&gt;: move the lb inside, directly after &lt;/<value-of select="local-name($prev/*[last()])"/>&gt;.
            </report>
        </rule>
        <rule context="(tei:l | tei:p | tei:head | tei:closer)[not(ancestor::tei:note)]">
            <let name="next" value="following::node()[self::* or self::text()[normalize-space()]][1]"/>
            <let name="end" value="(descendant::node()[self::* or self::text()[normalize-space()]])[last()]"/>
            <report test="$next[self::tei:div or self::tei:lg] and not($end[self::tei:lb])
                and replace(replace(string(.), '\$[^$]*\$', ''), '[\s\p{Z}]', '') ne ''" role="WARNING">
                [S-LBM] The line of this &lt;<value-of select="local-name()"/>&gt; ends before a new &lt;<value-of select="local-name($next)"/>&gt;, but its line end is not marked: add an lb after it (after the stanza's &lt;/lg&gt; for a verse).
            </report>
        </rule>
    </pattern>
    
    <!-- Simler: the tokens of @rendition in the order of the ODD's tagsDecl, single-spaced
         (schema/tei_simler.odd, rendition-order; applied by
         sonstige_transformationen/normalize-rendition-order.py). -->
    <pattern id="renditionOrder">
        <rule context="tei:*[@rendition]">
            <let name="order" value="('#aq', '#fr', '#b', '#i', '#c', '#right', '#g', '#k', '#in', '#sup', '#larger', '#smaller', '#et', '#et2', '#et3', '#hr', '#twocol', '#acrostic', '#acroInit', '#acroFin')"/>
            <let name="t" value="tokenize(normalize-space(@rendition), ' ')"/>
            <report test="string(@rendition) ne string-join(for $o in $order return $t[. = $o], ' ')" role="WARNING">
                [S-REN] @rendition="<value-of select="@rendition"/>" should read "<value-of select="string-join(for $o in $order return $t[. = $o], ' ')"/>": its tokens in the order of tagsDecl, single-spaced.
            </report>
        </rule>
    </pattern>
    
    <!-- Simler: lg/@type — one type="poem" per poem, no @type below it (schema/tei_simler.odd,
         lg-type; applied by sonstige_transformationen/normalize-lg-type.py). -->
    <pattern id="lgType">
        <rule context="tei:lg[@type]">
            <report test="ancestor::tei:lg" role="WARNING">
                [S-LGN] An lg inside an lg has no @type (here "<value-of select="@type"/>"): a stanza or a section is told by its nesting.
            </report>
            <report test="not(ancestor::tei:lg) and @type ne 'poem'" role="WARNING">
                [S-LGV] @type="<value-of select="@type"/>": the lg that holds a whole poem is type="poem". A stanza standing outside its poem's lg needs that lg round it.
            </report>
        </rule>
    </pattern>
    
    <!-- Simler: no whitespace next to a joined line end in the text; "und" after it means an
         elliptical hyphen and a plain lb (schema/tei_simler.odd, lb-joined; applied by
         sonstige_transformationen/normalize-lbno-whitespace.py). -->
    <pattern id="lbJoined">
        <rule context="tei:lb[@break='no']">
            <report test="not(preceding-sibling::node()[normalize-space() or self::*])" role="WARNING">
                [S-LBJ] A joined line end opens its element.
            </report>
            <report test="preceding-sibling::*[1][self::tei:fw[@type='catch']]" role="WARNING">
                [S-LBC] The line of a catchword ends with a plain lb.
            </report>
            <report test="(preceding-sibling::node()[1][self::text()][matches(., '\s$')] or following-sibling::node()[1][self::text()][matches(., '^\s')]) and (not(parent::tei:lg or parent::tei:div or parent::tei:body or parent::tei:front or parent::tei:back) or preceding-sibling::node()[1][self::text()[normalize-space()]] or following-sibling::node()[1][self::text()[normalize-space()]]) and preceding-sibling::node()[not(self::text()[not(normalize-space())])][1][self::text() or self::tei:hi or self::tei:supplied or self::tei:choice or self::tei:sic or self::tei:corr or self::tei:orig or self::tei:reg or self::tei:abbr or self::tei:expan or self::tei:unclear or self::tei:rs or self::tei:num or self::tei:foreign or self::tei:g] and following-sibling::node()[not(self::text()[not(normalize-space())])][1][self::text() or self::tei:hi or self::tei:supplied or self::tei:choice or self::tei:sic or self::tei:corr or self::tei:orig or self::tei:reg or self::tei:abbr or self::tei:expan or self::tei:unclear or self::tei:rs or self::tei:num or self::tei:foreign or self::tei:g]" role="WARNING">
                [S-LBW] Whitespace next to a joined line end splits the word in plain text: write er-&lt;lb break="no"/&gt;weißt (a line break may stand inside the tag). If the two words are separate, the line end is a plain lb instead.
            </report>
            <report test="matches(string-join(following-sibling::node()[position() le 2] ! string(), ''), '^\s*und([\s/.,:;!?]|$)', 'i')" role="WARNING">
                [S-LBU] The next word is "und": the hyphen ends a word (Geburt- und Sterb-Getichte), so the line end is a plain lb.
            </report>
        </rule>
    </pattern>
    
    <!-- Simler: renditions of a block are recorded on the block (schema/tei_simler.odd,
         hi-block-rendition and hi-spanning-rendition; applied by
         sonstige_transformationen/hoist-block-rendition.ps1 and hoist-spanning-rendition.ps1). -->
    <pattern id="hiBlockRendition">
        <rule context="tei:hi[tokenize(@rendition, '\s+') = ('#c', '#right', '#et', '#et2', '#et3')]">
            <report test="true()" role="WARNING">
                [S-HI] Alignment and indent (#c, #right, #et, #et2, #et3) belong on the enclosing block (head, p, l, …), not on hi.
            </report>
        </rule>
    </pattern>
    <pattern id="hiSpanningRendition">
        <rule context="tei:hi[@rendition][ancestor::tei:text]">
            <report test="parent::tei:*[local-name() = ('head', 'p', 'ab', 'signed', 'salute', 'closer', 'opener', 'dateline', 'byline', 'postscript', 'argument', 'epigraph', 'trailer', 'docTitle', 'titlePart', 'docAuthor', 'docEdition', 'docImprint', 'l', 'lg', 'label', 'speaker', 'stage', 'item', 'cell', 'note', 'fw')] and not(../text()[normalize-space()]) and count(../*[not(self::tei:lb or self::tei:pb or self::tei:cb or self::tei:milestone or self::tei:anchor or self::tei:space or self::tei:gap)]) = 1 and count(@*) = 1 and node() and not(tokenize(@rendition, '\s+') = ('#in', '#sup', '#sub', '#acrostic', '#acroInit', '#acroFin'))" role="WARNING">
                [S-HIB] This hi covers the whole &lt;<value-of select="local-name(..)"/>&gt;: its rendition belongs on the &lt;<value-of select="local-name(..)"/>&gt; (merged with the block's own, in tagsDecl order), and the hi can go.
            </report>
        </rule>
    </pattern>
    <pattern id="hiNesting">
        <rule context="tei:hi[@rendition][ancestor::tei:text]">
            <report test="parent::tei:hi and not(../text()[normalize-space()]) and count(../*[not(self::tei:lb or self::tei:pb or self::tei:cb or self::tei:milestone or self::tei:anchor or self::tei:space or self::tei:gap)]) = 1 and count(@*) = 1" role="WARNING">
                [S-HIN] This hi is the whole content of its parent hi: one hi with both renditions (<value-of select="../@rendition"/> <value-of select="@rendition"/>).
            </report>
            <report test="some $t in tokenize(normalize-space(@rendition), ' ') satisfies $t = (for $a in ancestor::*[@rendition] return tokenize(normalize-space($a/@rendition), ' '))" role="WARNING">
                [S-HIR] A token of this hi (<value-of select="@rendition"/>) is already on an ancestor: leave it out.
            </report>
        </rule>
    </pattern>

    <!-- Simler: the source reading first in choice; no space directly inside l/head/p
         (schema/tei_simler.odd, choice-order and line-inner-space; applied by
         sonstige_transformationen/simplify-markup.py). -->
    <pattern id="choiceOrder">
        <rule context="tei:choice">
            <report test="tei:corr[following-sibling::tei:sic] or tei:expan[following-sibling::tei:abbr]" role="WARNING">
                [S-CHO] In choice the source reading comes first: sic before corr, abbr before expan.
            </report>
        </rule>
    </pattern>
    <pattern id="lineInnerSpace">
        <rule context="tei:text//tei:l | tei:text//tei:head | tei:text//tei:p">
            <report test="node()[1][self::text()][matches(., '^[ &#9;]+([^\s]|$)')] or node()[last()][self::text()][matches(., '[^\s][ &#9;]+$')]" role="WARNING">
                [S-WS] A space directly after &lt;<name/>&gt; or before &lt;/<name/>&gt;: leave it out.
            </report>
        </rule>
    </pattern>
</schema>

