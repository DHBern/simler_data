<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:tei="http://www.tei-c.org/ns/1.0"
    exclude-result-prefixes="#all"
    version="3.0">
    
    <xsl:character-map name="escape-combining-chars">
        <!--Combining Acute Accent: -->
        <xsl:output-character character="&#769;" string="&amp;#x301;"/>
        <!--Combining Tilde: -->
        <xsl:output-character character="&#771;" string="&amp;#x303;"/>
        <!--Combining Comma Above: -->
        <xsl:output-character character="&#787;" string="&amp;#x313;"/>
        <!--Combining Greek Perispomeni: -->
        <xsl:output-character character="&#834;" string="&amp;#x342;"/>
        <!--Combining Latin Small Letter E: -->
        <xsl:output-character character="&#868;" string="&amp;#x364;"/>
        <!--Combining Latin Small Letter O: -->
        <xsl:output-character character="&#870;" string="&amp;#x366;"/>
    </xsl:character-map>
    
    <xsl:output method="xml" indent="no" use-character-maps="escape-combining-chars"/>
    
    <xsl:mode on-no-match="shallow-copy" />
    <xsl:mode name="enrich-pb" on-no-match="shallow-copy"/>
    <xsl:mode name="transform-renditions" on-no-match="shallow-copy"/>
    <xsl:mode name="remove-lines" on-no-match="shallow-copy"/>
    <xsl:mode name="move-lb" on-no-match="shallow-copy"/>
    <xsl:mode name="remove-lb-facs" on-no-match="shallow-copy"/>
    <xsl:mode name="add-lb-break" on-no-match="shallow-copy"/>
    <xsl:mode name="merge-ab" on-no-match="shallow-copy"/>
    <xsl:mode name="wrap-head" on-no-match="shallow-copy"/>
    <xsl:mode name="indent-whitespace" on-no-match="shallow-copy"/>
    
    <xsl:template match="/">
        
        <xsl:variable name="filename" select="descendant::*:titleStmt/*:title => replace(' ','_')"/>
        
        <xsl:call-template name="facsimile">
            <xsl:with-param name="filename" select="$filename||'_facs'"/>
            <xsl:with-param name="node" select="descendant::*:facsimile"/>
        </xsl:call-template>
        
        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates/>
        </xsl:variable>
        
        <xsl:variable name="manifest_id" select="
            if ($filename='A_1648') then '4017109'
            else if ($filename='B_1653') then '30217994'
            else if ($filename='C_1663') then '4049159'
            else if ($filename='D_1688') then '4076747'
            else ''"/>
        <xsl:variable name="manifest" select="if ($manifest_id != '' and unparsed-text-available('https://www.e-rara.ch/i3f/v20/'||$manifest_id||'/manifest/?manifest.json')) 
            then unparsed-text('https://www.e-rara.ch/i3f/v20/'||$manifest_id||'/manifest/?manifest.json') => json-to-xml() 
            else ''"/>

        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="enrich-pb">
                <xsl:with-param name="manifest" select="$manifest"/>
            </xsl:apply-templates>
        </xsl:variable>

        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="transform-renditions"/>
        </xsl:variable>
        
        <!-- De-activated -->
        <!--<xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="remove-lines"/>
        </xsl:variable>-->

        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="move-lb"/>
        </xsl:variable>
        
        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="remove-lb-facs"/>
        </xsl:variable>

        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="add-lb-break"/>
        </xsl:variable>
        
        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="merge-ab"/>
        </xsl:variable>

        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="wrap-head"/>
        </xsl:variable>
        
        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="indent-whitespace"/>
        </xsl:variable>
        
        <xsl:sequence select="$processed"/>
        
    </xsl:template>

    <xsl:template name="facsimile">
        <xsl:param name="filename"/>
        <xsl:param name="node"/>
        <xsl:result-document href="{$filename}.xml" method="xml" encoding="UTF-8">
            <facsimile xmlns="http://www.tei-c.org/ns/1.0" xml:id="{$filename}">
                <xsl:copy-of select="$node/node()"/>
            </facsimile>
        </xsl:result-document>
    </xsl:template>
    
    <xsl:template match="*:TEI">
        <xsl:copy>
            <xsl:apply-templates select="@*"/>
            <xsl:attribute name="xml:id" select="descendant::*:titleStmt/*:title => replace(' ','_')"/>
            <xsl:apply-templates select="node()"/>
        </xsl:copy>
    </xsl:template>
    
    <xsl:template match="*:facsimile"/>
   
    <xsl:template match="@*[.='']"/>
    
    <xsl:template match="@*[matches(.,'\\u0020') or matches(.,'\\u0022')]">
        <xsl:attribute name="{local-name()}" select=". => replace('\\u0020',' ') => replace('\\u0022','&quot;') => replace('\\u003b',';')"/>
    </xsl:template>

    <xsl:template match="*:abbreviation">
        <abbr xmlns="http://www.tei-c.org/ns/1.0">
            <xsl:apply-templates select="node()"/>
        </abbr>
    </xsl:template>
   
    <xsl:template match="*:blackening">
        <xsl:choose>
            <xsl:when test="@comment[normalize-space()]">
                <xsl:variable name="anchorId" select="'a'||count(preceding::*:comment | preceding::*:blackening[@comment[normalize-space()]] | preceding::*:unclear[@reason[normalize-space()]]) + 1"/>
                <anchor xmlns="http://www.tei-c.org/ns/1.0" xml:id="{$anchorId}"/>
                <supplied xmlns="http://www.tei-c.org/ns/1.0">
                    <xsl:apply-templates select="node()"/>
                </supplied>
                <note xmlns="http://www.tei-c.org/ns/1.0" type="annotation" targetEnd="{$anchorId}">
                    <p>
                        <xsl:value-of select="@comment => replace('\\u0020',' ') => replace('\\u0022','&quot;') => replace('\\u003b',';')"/>
                    </p>
                </note>
            </xsl:when>
            <xsl:otherwise>
                <supplied xmlns="http://www.tei-c.org/ns/1.0">
                    <xsl:apply-templates select="node()"/>
                </supplied>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    
    <xsl:template match="*:comment">
        <xsl:variable name="anchorId" select="'a'||count(preceding::*:comment | preceding::*:blackening[@comment[normalize-space()]] | preceding::*:unclear[@reason[normalize-space()]]) + 1"/>
        <anchor xmlns="http://www.tei-c.org/ns/1.0" xml:id="{$anchorId}"/>
        <xsl:if test="not(text()=' ')">
            <xsl:apply-templates select="node()"/>
        </xsl:if>
        <note xmlns="http://www.tei-c.org/ns/1.0" type="annotation" targetEnd="{$anchorId}">
            <p>
                <xsl:value-of select="@comment => replace('\\u0020',' ') => replace('\\u0022','&quot;') => replace('\\u003b',';')"/>
            </p>
        </note>
        <xsl:if test="text()=' '">
            <xsl:apply-templates select="node()"/>
        </xsl:if>
    </xsl:template>

    <xsl:template match="*:unclear">
        <xsl:choose>
            <xsl:when test="@reason[normalize-space()]">
                <xsl:variable name="anchorId" select="'a'||count(preceding::*:comment | preceding::*:blackening[@comment[normalize-space()]] | preceding::*:unclear[@reason[normalize-space()]]) + 1"/>
                <anchor xmlns="http://www.tei-c.org/ns/1.0" xml:id="{$anchorId}"/>
                <unclear xmlns="http://www.tei-c.org/ns/1.0">
                    <xsl:apply-templates select="node()"/>
                </unclear>
                <note xmlns="http://www.tei-c.org/ns/1.0" type="annotation" targetEnd="{$anchorId}">
                    <p>
                        <xsl:value-of select="@reason => replace('\\u0020',' ') => replace('\\u0022','&quot;') => replace('\\u003b',';')"/>
                    </p>
                </note>
            </xsl:when>
            <xsl:otherwise>
                <unclear xmlns="http://www.tei-c.org/ns/1.0">
                    <xsl:apply-templates select="node()"/>
                </unclear>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    
    <xsl:template match="*:printing_error">
        <xsl:choose>
            <xsl:when test="@sic">
                <choice xmlns="http://www.tei-c.org/ns/1.0">
                    <sic>
                        <xsl:value-of select="@sic"/>
                    </sic>
                    <corr>
                        <xsl:apply-templates select="node()"/>
                    </corr>
                </choice>
            </xsl:when>
            <xsl:otherwise>
                <choice xmlns="http://www.tei-c.org/ns/1.0">
                    <sic>
                        <xsl:apply-templates select="node()"/>
                    </sic>
                    <corr/>
                </choice>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>
    
    <xsl:template match="*:lb/@n"/>
    
    <xsl:template match="*:lb/@facs">
        <xsl:attribute name="facs" select=". => replace((ancestor::*:ab)[1]/@facs,'') => replace('^_','')"/>
    </xsl:template>
    
    <xsl:template match="*:pb">
        <xsl:variable name="page_number" select="if (following-sibling::*:ab[1]/*:Page_number[1]) then
            following-sibling::*:ab[1]/*:Page_number[1] => normalize-space()
            else if (following-sibling::*:ab[1]/*:page_number[1]) then
            following-sibling::*:ab[1]/*:page_number[1] => normalize-space()
            else ''"/>
        <xsl:copy>
            <xsl:attribute name="facs" select="@n"/>
            <xsl:if test="$page_number[normalize-space()]">
                <xsl:attribute name="n" select="$page_number"/>
            </xsl:if>
            <xsl:apply-templates select="node()"/>
        </xsl:copy>
    </xsl:template> 

    <xsl:template match="*:Numbering">
        <num xmlns="http://www.tei-c.org/ns/1.0">
            <xsl:apply-templates select="node()"/>
        </num>
    </xsl:template>
    
    <xsl:template match="text()">
        <xsl:analyze-string select="." regex="\$(.+)\$ ">
            <xsl:matching-substring>
                <label xmlns="http://www.tei-c.org/ns/1.0">[<xsl:value-of select="regex-group(1)"/>.]</label>
            </xsl:matching-substring>
            <xsl:non-matching-substring>
                <xsl:value-of select="."/>
            </xsl:non-matching-substring>
        </xsl:analyze-string>
    </xsl:template>
    
    <xsl:template match="*:Catch_word">
        <fw place="bottom" type="catch" xmlns="http://www.tei-c.org/ns/1.0">
            <xsl:apply-templates select="node()"/>
        </fw>
    </xsl:template>
    
    <xsl:template match="*:Header">
        <fw place="top" type="header" xmlns="http://www.tei-c.org/ns/1.0">
            <xsl:apply-templates select="node()"/>
        </fw>
    </xsl:template>
    
    <xsl:template match="*:Page_number|*:page_number">
        <fw place="top" type="pageNum" xmlns="http://www.tei-c.org/ns/1.0">
            <xsl:apply-templates select="node()"/>
        </fw>
    </xsl:template>
    
    <xsl:template match="*:Pagination">
        <fw place="bottom" type="pageNum" xmlns="http://www.tei-c.org/ns/1.0">
            <xsl:apply-templates select="node()"/>
        </fw>
    </xsl:template>
    
    <!-- [mode] enrich-pb 
                enrich pb elements with canvas urls from iiif manifest
       ======================================== --> 

    <xsl:template match="*:pb" mode="enrich-pb">
        <xsl:param name="manifest"/>
        <xsl:variable name="page_index" select="@facs"/>
        <xsl:copy>
            <xsl:apply-templates select="@*" mode="enrich-pb"/>
            <xsl:if test="$manifest and $manifest!=''">
                <xsl:variable name="canvas_id" select="$manifest//*:map[(*:string[@key='label'] => replace('\[','') => replace('\]',''))=$page_index]/*:string[@key='@id']"/>
                <xsl:if test="$canvas_id and $canvas_id!=''">
                    <xsl:attribute name="facs" select="$canvas_id"/>
                </xsl:if>
            </xsl:if>
            <xsl:apply-templates select="node()" mode="enrich-pb"/>
        </xsl:copy>
    </xsl:template>
    
    <!-- [mode] transform-renditions 
                transform rendition tags to hi elements with according value in @rendition
       ======================================== -->  
    
    <xsl:template match="*:Antiqua" mode="transform-renditions">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#aq">
            <xsl:apply-templates select="node()" mode="transform-renditions"/>
        </hi>
    </xsl:template>
    
    <xsl:template match="*:Bold" mode="transform-renditions">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#b">
            <xsl:apply-templates select="node()" mode="transform-renditions"/>
        </hi>
    </xsl:template>

    <xsl:template match="*:italic" mode="transform-renditions">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#i">
            <xsl:apply-templates select="node()" mode="transform-renditions"/>
        </hi>
    </xsl:template>
    
    <xsl:template match="*:Spaced_letters" mode="transform-renditions">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#g">
            <xsl:apply-templates select="node()" mode="transform-renditions"/>
        </hi>
    </xsl:template>
    
    <xsl:template match="*:Small_capitals" mode="transform-renditions">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#k">
            <xsl:apply-templates select="node()" mode="transform-renditions"/>
        </hi>
    </xsl:template>
    
    <xsl:template match="*:Initial_letter" mode="transform-renditions">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#in">
            <xsl:apply-templates select="node()" mode="transform-renditions"/>
        </hi>
    </xsl:template>
    
    <!-- [mode] remove-lines 
                remove lines containing page numbers, headers, catch words, or pagination
       ======================================== -->  
    
    <xsl:template match="*:body/*:div/*:ab" mode="remove-lines">
        <xsl:copy>
            <xsl:copy-of select="@*"/>
            <xsl:for-each-group select="node()" group-starting-with="*:lb | *:pb">
                <xsl:for-each-group select="current-group()" group-ending-with="text()[matches(.,'\n')]">
                    <xsl:choose>
                        <xsl:when test="current-group()[
                                (descendant-or-self::*:page_number or 
                                descendant-or-self::*:Page_number or 
                                descendant-or-self::*:Header or 
                                descendant-or-self::*:Catch_word or 
                                descendant-or-self::*:Pagination) 
                                and 
                                not(descendant-or-self::*:lb)
                                and 
                                not(descendant-or-self::*:note)
                            ]">
                            <!--<xsl:comment><xsl:sequence select="current-group()" /></xsl:comment>-->
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:sequence select="current-group()" />
                        </xsl:otherwise>
                    </xsl:choose>
                </xsl:for-each-group>
            </xsl:for-each-group>
        </xsl:copy>
    </xsl:template> 

    <!-- [mode] move-lb 
                move lb from line beginning to line end
       ======================================== -->  
    
    <xsl:template match="*:body/*:div/*:ab" mode="move-lb">
        <xsl:copy>
            <xsl:copy-of select="@*"/>
            <xsl:for-each-group select="node()" group-starting-with="*:lb">
                <xsl:apply-templates select="current-group()" mode="move-lb"/>
            </xsl:for-each-group>
        </xsl:copy>
    </xsl:template>
    
    <xsl:template match="text()
        [matches(.,'\n') and not(matches(.,'\n.*\n'))]
        [ancestor::*:ab]
        [not(position() = 1 and parent::*:ab)]" 
        mode="move-lb">
        <xsl:variable name="facs" select="(preceding::*:lb)[last()]/@facs"/>
        <xsl:analyze-string select="." regex="\n">
            <xsl:matching-substring>
                <lb xmlns="http://www.tei-c.org/ns/1.0" facs="{$facs}"/><xsl:text>&#xa;</xsl:text>
            </xsl:matching-substring>
            <xsl:non-matching-substring>
                <xsl:value-of select="."/>
            </xsl:non-matching-substring>
        </xsl:analyze-string>
    </xsl:template>
    
    <xsl:template match="*:lb" mode="move-lb"/>
    
    <!-- [mode] remove-lb-facs 
                remove facs attribute from lb
       ======================================== -->  
    
    <xsl:template match="*:lb/@facs" mode="remove-lb-facs"/>
    
    <!-- [mode] add-lb-break
                add break "no" attribute
       ======================================== -->  
    
    <xsl:template match="*:lb" mode="add-lb-break">
        <xsl:copy>
            <xsl:apply-templates select="@*" mode="add-lb-break"/>
            <xsl:if test="matches(preceding::text()[1],'-\s*$')">
                <xsl:attribute name="break">no</xsl:attribute>
            </xsl:if>
            <xsl:apply-templates select="node()" mode="add-lb-break"/>
        </xsl:copy>
    </xsl:template>
    
    <!-- [mode] merge-ab 
                merge ab and add milestone as marker
       ======================================== -->  

    <xsl:template match="*:ab" mode="merge-ab">
        <!--<milestone xmlns="http://www.tei-c.org/ns/1.0" unit="page" ana="{@facs}"/>-->
        <xsl:apply-templates select="node()" mode="merge-ab"/>
    </xsl:template>
    
    
    <!-- [mode] wrap-head 
                wrap elements in head
       ======================================== -->  

    <!--
        Example:
        <num>4.</num><lb/>
    -->
    <xsl:template match="*:num
        [preceding-sibling::node()[1][self::text()]]
        [following-sibling::node()[1][self::*:lb]]" 
        mode="wrap-head">
        <head xmlns="http://www.tei-c.org/ns/1.0">
            <xsl:copy>
                <xsl:apply-templates select="node()|@*" mode="wrap-head"/> 
            </xsl:copy>
        </head>
    </xsl:template>
    
    <!--
        Example:
        <hi rendition="#aq"><num>XXII.</num></hi><lb/>
    -->
    <xsl:template match="*:hi[@rendition='#aq'][*:num]
        [not(descendant::*:lb)]
        [preceding-sibling::node()[1][self::text()]]
        [following-sibling::node()[1][self::*:lb]]" 
        mode="wrap-head">
        <head xmlns="http://www.tei-c.org/ns/1.0">
            <xsl:copy>
                <xsl:apply-templates select="node()|@*" mode="wrap-head"/>
            </xsl:copy>   
        </head>
    </xsl:template>
    
    <!--
        Example:
        <label/><hi rendition="#aq"><num>XXII.</num></hi><lb/>
    -->
    <xsl:template match="*:body/*:div" mode="wrap-head">
        <xsl:copy>
            <xsl:copy-of select="@*"/>
            <xsl:for-each-group select="node()" group-starting-with="*:label">
                <xsl:for-each-group select="current-group()" group-ending-with="*:lb">
                    <xsl:choose>
                        <xsl:when test="position() = 1 and 
                            current-group()[self::*:label] and 
                            current-group()[self::*:lb] and 
                            current-group()[self::*:hi[@rendition='#aq'][*:num]] and 
                            not(current-group()[text()[matches(.,'\n')]])">
                            <head xmlns="http://www.tei-c.org/ns/1.0">
                                <xsl:apply-templates select="current-group()[not(self::*:lb)]" mode="wrap-head"/>
                            </head>
                            <xsl:apply-templates select="current-group()/self::*:lb" mode="wrap-head"/>
                        </xsl:when>
                        <xsl:otherwise>
                            <xsl:apply-templates select="current-group()" mode="wrap-head"/>
                        </xsl:otherwise>
                    </xsl:choose>
                </xsl:for-each-group>
            </xsl:for-each-group>
        </xsl:copy>
    </xsl:template>

    <!-- [mode] indent-whitespace 
                indent whitespace
       ======================================== -->  
    
    <xsl:template match="text()" mode="indent-whitespace" expand-text="yes">
        <xsl:text disable-output-escaping="yes">{. 
            => replace('               ','            ')
            => replace('\n            \n            ','&#xa;            ')}</xsl:text>     
    </xsl:template>
    
    <xsl:template match="*:label" mode="indent-whitespace">
        <xsl:copy>
            <xsl:apply-templates select="node()|@*" mode="indent-whitespace"/>
        </xsl:copy>
        <xsl:text> </xsl:text>
    </xsl:template>
    
    <xsl:template match="*:lb" mode="indent-whitespace">
        <xsl:text>&#xa;            </xsl:text>
        <xsl:copy>
            <xsl:apply-templates select="node()|@*" mode="indent-whitespace"/>
        </xsl:copy>
    </xsl:template>
    
</xsl:stylesheet>