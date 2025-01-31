<?xml version="1.0" encoding="UTF-8"?>
<xsl:transform xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:xd="http://www.oxygenxml.com/ns/doc/xsl"
  xmlns="http://www.loc.gov/METS/"
  xpath-default-namespace="http://www.loc.gov/METS/"
  exclude-result-prefixes="#all"
  expand-text="true"
  version="3.0">
  <xd:doc scope="stylesheet">
    <xd:desc>
      <xd:p><xd:b>Created on:</xd:b> Jan 31, 2025</xd:p>
      <xd:p><xd:b>Author:</xd:b> cf, pd</xd:p>
      <xd:p></xd:p>
    </xd:desc>
  </xd:doc>
  
  <xsl:mode on-no-match="shallow-copy"/>
  
  <xsl:param name="fileName" select="(base-uri() => tokenize('/'))[last()]"/>
  
  <xsl:template name="xsl:initial-template">
    
    <xsl:result-document href=".issue-reply-post-transform.txt" method="text" encoding="UTF-8">
      <xsl:text>Transkribus export: {$fileName}&#xA;</xsl:text>
      <xsl:text>&#xA;</xsl:text>
      <xsl:text>**Exported:**&#xA;</xsl:text>
      <xsl:text>&#xA;</xsl:text>
      <xsl:text>* [`exported/{$fileName}`](https://github.com/DHBern/simler_data/tree/main/exported/{$fileName})&#xA;</xsl:text>
      <xsl:text>&#xA;</xsl:text>
    </xsl:result-document>

    <xsl:result-document href=".commit-message.txt" method="text" encoding="UTF-8">
      <xsl:text>Transkribus export: {$fileName}</xsl:text>
    </xsl:result-document>
    
  </xsl:template>
  
</xsl:transform>