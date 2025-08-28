<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    xmlns:tei="http://www.tei-c.org/ns/1.0"
    exclude-result-prefixes="#all"
    version="3.0">
    
    <xsl:output method="xml" indent="no"/>
    
    <xsl:mode on-no-match="shallow-copy" />
    
    <xsl:template match="*:Bold">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#b">
            <xsl:apply-templates select="node()"/>
        </hi>
    </xsl:template>
    
    <xsl:template match="*:Antiqua">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#aq">
            <xsl:apply-templates select="node()"/>
        </hi>
    </xsl:template>

    <xsl:template match="*:italic">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#i">
            <xsl:apply-templates select="node()"/>
        </hi>
    </xsl:template>

    <xsl:template match="*:Spaced_letters">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#g">
            <xsl:apply-templates select="node()"/>
        </hi>
    </xsl:template>
    
    <xsl:template match="*:Small_capitals">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#k">
            <xsl:apply-templates select="node()"/>
        </hi>
    </xsl:template>
    
    <xsl:template match="*:Initial_letter">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#in">
            <xsl:apply-templates select="node()"/>
        </hi>
    </xsl:template>
    
    <xsl:template match="*:abbreviation">
        <abbr xmlns="http://www.tei-c.org/ns/1.0">
            <xsl:apply-templates select="node()"/>
        </abbr>
    </xsl:template>
    
    <xsl:template match="*:printing_error">
        <xsl:choose>
            <xsl:when test="@sic">
                <choice xmlns="http://www.tei-c.org/ns/1.0">
                    <sic>
                        <xsl:value-of select="@sic => replace('\\u0020',' ')"/>
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
    
    <xsl:template match="*:supplied/@reason[.='']"/>
    
</xsl:stylesheet>