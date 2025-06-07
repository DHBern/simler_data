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

    <xsl:template match="*:Initial_letter">
        <hi xmlns="http://www.tei-c.org/ns/1.0" rendition="#in">
            <xsl:apply-templates select="node()"/>
        </hi>
    </xsl:template>
    
</xsl:stylesheet>