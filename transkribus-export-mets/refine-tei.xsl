<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:tei="http://www.tei-c.org/ns/1.0"
    exclude-result-prefixes="#all"
    version="3.0">
    
    <xsl:character-map name="escape-combining-chars">
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
    <xsl:mode name="transform-renditions" on-no-match="shallow-copy"/>
    <xsl:mode name="remove-lines" on-no-match="shallow-copy"/>
    <xsl:mode name="move-lb" on-no-match="shallow-copy"/>
    <xsl:mode name="merge-ab" on-no-match="shallow-copy"/>
    <xsl:mode name="indent-whitespace" on-no-match="shallow-copy"/>
    
    <xsl:template match="/">

        <xsl:call-template name="facsimile">
            <xsl:with-param name="filename" select="descendant::*:titleStmt/*:title => replace(' ','_')||'_facs'"/>
            <xsl:with-param name="node" select="descendant::*:facsimile"/>
        </xsl:call-template>
        
        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates/>
        </xsl:variable>
        
        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="transform-renditions"/>
        </xsl:variable>
        
        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="remove-lines"/>
        </xsl:variable>

        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="move-lb"/>
        </xsl:variable>
        
        <xsl:variable name="processed" as="node()*">
            <xsl:apply-templates select="$processed" mode="merge-ab"/>
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
    
    <xsl:template match="*:comment">
        <xsl:variable name="anchorId" select="'a'||count(preceding::*:comment) + 1"/>
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
            <xsl:apply-templates select="@n"/>
            <xsl:if test="$page_number[normalize-space()]">
                <xsl:attribute name="test" select="$page_number"/>
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
    
    <xsl:template match="text()[matches(.,'\n')][preceding-sibling::*:lb]" mode="move-lb">
        <xsl:variable name="facs" select="(preceding-sibling::*:lb)[last()]/@facs"/>
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
    
    <!-- [mode] merge-ab 
                merge ab and add milestone as marker
       ======================================== -->  

    <xsl:template match="*:ab" mode="merge-ab">
        <milestone xmlns="http://www.tei-c.org/ns/1.0" unit="page" ana="{@facs}"/>
        <xsl:apply-templates select="node()" mode="merge-ab"/>
    </xsl:template>
    
    <!-- [mode] indent-whitespace 
                indent whitespace
       ======================================== -->  
    
    <xsl:template match="text()" mode="indent-whitespace" expand-text="yes">
        <xsl:text disable-output-escaping="yes">{. 
            => replace('\n            \n            ','&#xa;            ')}</xsl:text>     
    </xsl:template>
    
</xsl:stylesheet>