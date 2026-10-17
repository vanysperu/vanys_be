import {
  ITemplate,
  ITemplateSupplier,
} from "../interfaces/ITemplate.interface";

export const template_create_admin = (vars: ITemplate) => {
  return `
  <!DOCTYPE html>
  <html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <meta name="viewport" content="initial-scale=1.0">
      <meta name="format-detection" content="telephone=no">
      <title>Solicitud Aprobada</title>
      <style type="text/css">
          body {
              margin: 0;
              padding: 0;
          }
          img {
              border: 0px;
              display: block;
          }
          .socialLinks {
              font-size: 6px;
          }
          .socialLinks a {
              display: inline-block;
          }
          .long-text p {
              margin: 1em 0px;
          }
          .long-text p:last-child {
              margin-bottom: 0px;
          }
          .long-text p:first-child {
              margin-top: 0px;
          }
      </style>
      <style type="text/css">
          /* yahoo, hotmail */
          .ExternalClass,
          .ExternalClass p,
          .ExternalClass span,
          .ExternalClass font,
          .ExternalClass td,
          .ExternalClass div {
              line-height: 100%;
          }
          .yshortcuts a {
              border-bottom: none !important;
          }
          .vb-outer {
              min-width: 0 !important;
          }
          .RMsgBdy,
          .ExternalClass {
              width: 100%;
              background-color: #3f3f3f;
              background-color: #3f3f3f
          }
          /* outlook/office365 add buttons outside not-linked images and safari have 2px margin */
          [o365] button {
              margin: 0 !important;
          }
          /* outlook */
          table {
              mso-table-rspace: 0pt;
              mso-table-lspace: 0pt;
          }
          #outlook a {
              padding: 0;
          }
          img {
              outline: none;
              text-decoration: none;
              border: none;
              -ms-interpolation-mode: bicubic;
          }
          a img {
              border: none;
          }
          @media screen and (max-width: 600px) {
              table.vb-container,
              table.vb-row {
                  width: 95% !important;
              }
              .mobile-hide {
                  display: none !important;
              }
              .mobile-textcenter {
                  text-align: center !important;
              }
              .mobile-full {
                  width: 100% !important;
                  max-width: none !important;
              }
          }
          /* previously used also screen and (max-device-width: 600px) but Yahoo Mail doesn't support multiple queries */
      </style>
      <style type="text/css">
          #ko_textBlock_4 .links-color a,
          #ko_textBlock_4 .links-color a:link,
          #ko_textBlock_4 .links-color a:visited,
          #ko_textBlock_4 .links-color a:hover {
              color: #3f3f3f;
              color: #3f3f3f;
              text-decoration: underline
          }
          #ko_footerBlock_2 .links-color a,
          #ko_footerBlock_2 .links-color a:link,
          #ko_footerBlock_2 .links-color a:visited,
          #ko_footerBlock_2 .links-color a:hover {
              color: #cccccc;
              color: #cccccc;
              text-decoration: underline
          }
      </style>
  </head>
  <body bgcolor="#fff" text="#919191" alink="#cccccc" vlink="#cccccc" style="margin: 0; padding: 0; background-color: #fff; color: #919191;">
      <center>
          <!-- preheaderBlock -->
          <!-- /preheaderBlock -->
          <table class="vb-outer" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
              id="ko_logoBlock_3">
              <tbody>
                  <tr>
                      <td class="vb-outer" align="center" valign="top" style=" padding-left: 9px; padding-right: 9px; font-size: 0;">
                          <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
                          <!--
        -->
                          <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
                              <table border="0" cellpadding="0" cellspacing="9" bgcolor="#ffffff" width="570" class="vb-row" style="border-collapse: separate; width: 100%; background: #ffffff; border-top-left-radius:50px; border-top-right-radius:50px; mso-cellspacing: 9px; border-spacing: 9px; max-width: 570px; -mru-width: 0px;">
                                  <tbody>
                                      <tr>
                                          <td align="center" valign="top" style="font-size: 0;">
                                              <div style="display: inline-block; vertical-align: top; width: 100%; max-width: 276px; -mru-width: 0px;">
                                                  <!--
          -->
                                                  <table class="vb-content" border="0" cellspacing="9" cellpadding="0" width="276" style="border-collapse: separate; width: 100%; mso-cellspacing: 9px; border-spacing: 9px;">
                                                      <!-- TODO nel template originale abbiamo anche un font-size: 18px, externalTextStyle.size ... -->
                                                      <tbody>
                                                          <tr>
                                                              <td width="100%" valign="top" align="center" class="links-color" style="">
                                                                  <!--[if (lte ie 8)]><div style="display: inline-block; width: 258px; -mru-width: 0px;"><![endif]-->
                                                                  <img alt="" border="0" hspace="0" align="center" vspace="0" width="258" style="display: block; vertical-align: top; height: auto; margin: 0 auto; color: #3f3f3f; font-size: 13px; font-family: Arial, Helvetica, sans-serif; width: 100%; max-width: 70px; height: auto;border: 1px solid white; border-radius: 8px;"
                                                                      src="${vars.logo || ''}"/>
                                                                     
                                                                  <!--[if (lte ie 8)]></div><![endif]-->
                                                              </td>
                                                          </tr>
                                                      </tbody>
                                                  </table>
                                              </div>
                                          </td>
                                      </tr>
                                  </tbody>
                              </table>
                          </div>
                          <!--
      -->
                          <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
                      </td>
                  </tr>
              </tbody>
          </table>
          <table class="vb-outer" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
              id="ko_textBlock_4">
              <tbody>
                  <tr>
                      <td class="vb-outer" align="center" valign="top" style="padding-left: 9px; padding-right: 9px; font-size: 0;">
                          <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
                          <!--
        -->
                          <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
                              <table border="0" cellpadding="0" cellspacing="18" bgcolor="#ffffff" width="570" class="vb-container" style="border-collapse: separate; width: 100%; background-color: #ffffff; mso-cellspacing: 18px; border-spacing: 18px; max-width: 570px; -mru-width: 0px;">
                                  <tbody>
                                      <tr>
                                          <td class="long-text links-color" width="100%" valign="top" align="left" style="font-weight: normal; color: #3f3f3f; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: left; line-height: normal;">
                                              <p style="margin: 1em 0px; margin-top: 0px;"><strong>¡Hola ${
                                                vars.names
                                              }!</strong></p>
                                              <p style="margin: 1em 0px; margin-top: 0px;">Este es tu primer paso para ingresar a <strong>${
                                                vars.company_name
                                              }</strong></p>
                                              <p style="margin: 1em 0px; margin-top: 0px;">Tu contraseña es: <strong>${
                                                vars.password
                                              }</strong></p>
                                              <p style="margin: 1em 0px; margin-top: 0px;">Presiona el botón para continuar:</p>
                                              <p align="center" style="padding-top: 10px; padding-bottom: 10px;"><a style="border-radius: 10px; text-decoration: none; font-weight: normal; padding: 10px; background-color: ${
                                                vars.p_color
                                              }; color: #ffffff; width:200px;font-size: 17px; font-family: Arial, Helvetica, sans-serif;"
                                                  target="_new" href="${
                                                    vars.redirect_buttom
                                                  }">Continuar</a></p>
                                              <p>En caso no puedas ingresar desde el botón, copia este link en tu navegador:</p>
                                              <p style="margin: 1em 0px;">${
                                                vars.redirect_buttom
                                              }</p>
                                          </td>
                                      </tr>
                                  </tbody>
                              </table>
                          </div>
                          <!--
      -->
                          <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
                      </td>
                  </tr>
              </tbody>
          </table>
          <!-- footerBlock -->
          <table class="vb-outer" style="margin-top: 25px;" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
              id="ko_preheaderBlock_1">
              <tbody>
                  <tr>
                      <td class="vb-outer" align="center" valign="top" style="padding-left: 9px; padding-right: 9px; font-size: 0;">
                          <div style="font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;"></div>
                          <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
                          <!--
        -->
                          <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
                              <table border="0" cellpadding="0" cellspacing="0" style="background:${
                                vars.s_color
                              }; border-bottom-left-radius:50px; border-bottom-right-radius:50px; border-collapse: separate; width: 100%; mso-cellspacing: 0px; border-spacing: 0px; max-width: 570px; -mru-width: 0px;"
                                  width="570" class="vb-row">
                                  <tbody>
                                      <tr>
                                          <td align="center" valign="top" style="font-size: 0; padding: 0 9px;">
                                              <div style="width: 100%; max-width: 552px; -mru-width: 0px;">
                                                  <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="552"><tr><![endif]-->
                                                  <!--
          -->
                                                  <!--
            -->
                                                  <!--[if (gte mso 9)|(lte ie 8)]><td align="left" valign="top" width="276"><![endif]-->
                                                  <!--
        -->
                                                  <!--[if (gte mso 9)|(lte ie 8)]></td><![endif]-->
                                                  <!--
            -->
                                                  <!--[if (gte mso 9)|(lte ie 8)]><td align="left" valign="top" width="276" class="mobile-hide"><![endif]-->
                                                  <!--
        -->
                                                  <div class="mobile-full mobile-hide" style="display: inline-block; vertical-align: top; width: 100%; max-width: 276px; -mru-width: 0px; min-width: calc(50%); max-width: calc(100%);">
                                                      <!--
          -->
                                                      <table class="vb-content" border="0" cellspacing="9" cellpadding="0" style="border-collapse: separate; width: 100%; mso-cellspacing: 9px; border-spacing: 9px;"
                                                          >
                                                          <tbody>
                                                              <tr>
                                                                  <td width="100%" valign="top" align="center" style="font-weight: normal; color: #ffffff; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: center;">
                                                                      <a href="%5Bshow_link%5D" style="color: #ffffff; text-decoration: underline;display: block;padding: 5px;" target="_new">${
                                                                        vars.company_name
                                                                      } ${new Date().getFullYear()} Todos los derechos reservados</a>
                                                                  </td>
                                                              </tr>
                                                          </tbody>
                                                      </table>
                                                      <!--
        -->
                                                  </div>
                                                  <!--[if (gte mso 9)|(lte ie 8)]></td><![endif]-->
                                                  <!--
          -->
                                                  <!--
        -->
                                                  <!--[if (gte mso 9)|(lte ie 8)]></tr></table><![endif]-->
                                              </div>
                                          </td>
                                      </tr>
                                  </tbody>
                              </table>
                          </div>
                          <!--
      -->
                          <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
                      </td>
                  </tr>
              </tbody>
          </table>
          <!-- /footerBlock -->
      </center>
  </body>
  </html>
    `;
};

export const template_create_user = (vars: ITemplate) => {
  return `
    
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml" xmlns="http://www.w3.org/1999/xhtml"
    lang="en" xml:lang="en" style="min-height: 100%; background-color: #fff;" xml:lang="en">
      
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width" />
        <meta name="format-detection" content="date=no" />
        <meta name="format-detection" content="telephone=no" />
        <title>Welcome to Taylor Stitch Mens</title>
        <style>
          @media only screen and (max-width:720px) {
            .small-float-center {
              margin: 0 auto !important; float: none !important; text-align: center !important;
            }
            .small-text-center {
              text-align: center !important;
            }
            .small-text-left {
              text-align: left !important;
            }
            .small-text-right {
              text-align: right !important;
            }
            .hide-for-large {
              display: block !important; width: auto !important; overflow: visible !important; max-height: none !important; font-size: inherit !important; line-height: inherit !important;
            }
            table.body table.container .hide-for-large {
              display: table !important; width: 100% !important;
            }
            table.body table.container .row.hide-for-large {
              display: table !important; width: 100% !important;
            }
            table.body table.container .callout-inner.hide-for-large {
              display: table-cell !important; width: 100% !important;
            }
            table.body table.container .show-for-large {
              display: none !important; width: 0; mso-hide: all; overflow: hidden;
            }
            table.body img {
              width: auto; height: auto;
            }
            table.body center {
              min-width: 0 !important;
            }
            table.body .container {
              width: 100% !important;
            }
            table.body .column {
              height: auto !important; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box; padding-left: 20px !important; padding-right: 20px !important;
            }
            table.body .columns {
              height: auto !important; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box; padding-left: 20px !important; padding-right: 20px !important;
            }
            table.body .column .column {
              padding-left: 0 !important; padding-right: 0 !important;
            }
            table.body .column .columns {
              padding-left: 0 !important; padding-right: 0 !important;
            }
            table.body .columns .column {
              padding-left: 0 !important; padding-right: 0 !important;
            }
            table.body .columns .columns {
              padding-left: 0 !important; padding-right: 0 !important;
            }
            table.body .collapse .column {
              padding-left: 0 !important; padding-right: 0 !important;
            }
            table.body .collapse .columns {
              padding-left: 0 !important; padding-right: 0 !important;
            }
            td.small-1 {
              display: inline-block !important; width: 8.33333% !important;
            }
            th.small-1 {
              display: inline-block !important; width: 8.33333% !important;
            }
            td.small-2 {
              display: inline-block !important; width: 16.66667% !important;
            }
            th.small-2 {
              display: inline-block !important; width: 16.66667% !important;
            }
            td.small-3 {
              display: inline-block !important; width: 25% !important;
            }
            th.small-3 {
              display: inline-block !important; width: 25% !important;
            }
            td.small-4 {
              display: inline-block !important; width: 33.33333% !important;
            }
            th.small-4 {
              display: inline-block !important; width: 33.33333% !important;
            }
            td.small-5 {
              display: inline-block !important; width: 41.66667% !important;
            }
            th.small-5 {
              display: inline-block !important; width: 41.66667% !important;
            }
            td.small-6 {
              display: inline-block !important; width: 50% !important;
            }
            th.small-6 {
              display: inline-block !important; width: 50% !important;
            }
            td.small-7 {
              display: inline-block !important; width: 58.33333% !important;
            }
            th.small-7 {
              display: inline-block !important; width: 58.33333% !important;
            }
            td.small-8 {
              display: inline-block !important; width: 66.66667% !important;
            }
            th.small-8 {
              display: inline-block !important; width: 66.66667% !important;
            }
            td.small-9 {
              display: inline-block !important; width: 75% !important;
            }
            th.small-9 {
              display: inline-block !important; width: 75% !important;
            }
            td.small-10 {
              display: inline-block !important; width: 83.33333% !important;
            }
            th.small-10 {
              display: inline-block !important; width: 83.33333% !important;
            }
            td.small-11 {
              display: inline-block !important; width: 91.66667% !important;
            }
            th.small-11 {
              display: inline-block !important; width: 91.66667% !important;
            }
            td.small-12 {
              display: inline-block !important; width: 100% !important;
            }
            th.small-12 {
              display: inline-block !important; width: 100% !important;
            }
            .column td.small-12 {
              display: block !important; width: 100% !important;
            }
            .column th.small-12 {
              display: block !important; width: 100% !important;
            }
            .columns td.small-12 {
              display: block !important; width: 100% !important;
            }
            .columns th.small-12 {
              display: block !important; width: 100% !important;
            }
            table.body td.small-offset-1 {
              margin-left: 8.33333% !important;
            }
            table.body th.small-offset-1 {
              margin-left: 8.33333% !important;
            }
            table.body td.small-offset-2 {
              margin-left: 16.66667% !important;
            }
            table.body th.small-offset-2 {
              margin-left: 16.66667% !important;
            }
            table.body td.small-offset-3 {
              margin-left: 25% !important;
            }
            table.body th.small-offset-3 {
              margin-left: 25% !important;
            }
            table.body td.small-offset-4 {
              margin-left: 33.33333% !important;
            }
            table.body th.small-offset-4 {
              margin-left: 33.33333% !important;
            }
            table.body td.small-offset-5 {
              margin-left: 41.66667% !important;
            }
            table.body th.small-offset-5 {
              margin-left: 41.66667% !important;
            }
            table.body td.small-offset-6 {
              margin-left: 50% !important;
            }
            table.body th.small-offset-6 {
              margin-left: 50% !important;
            }
            table.body td.small-offset-7 {
              margin-left: 58.33333% !important;
            }
            table.body th.small-offset-7 {
              margin-left: 58.33333% !important;
            }
            table.body td.small-offset-8 {
              margin-left: 66.66667% !important;
            }
            table.body th.small-offset-8 {
              margin-left: 66.66667% !important;
            }
            table.body td.small-offset-9 {
              margin-left: 75% !important;
            }
            table.body th.small-offset-9 {
              margin-left: 75% !important;
            }
            table.body td.small-offset-10 {
              margin-left: 83.33333% !important;
            }
            table.body th.small-offset-10 {
              margin-left: 83.33333% !important;
            }
            table.body td.small-offset-11 {
              margin-left: 91.66667% !important;
            }
            table.body th.small-offset-11 {
              margin-left: 91.66667% !important;
            }
            table.body table.columns td.expander {
              display: none !important;
            }
            table.body table.columns th.expander {
              display: none !important;
            }
            table.body .right-text-pad {
              padding-left: 10px !important;
            }
            table.body .text-pad-right {
              padding-left: 10px !important;
            }
            table.body .left-text-pad {
              padding-right: 10px !important;
            }
            table.body .text-pad-left {
              padding-right: 10px !important;
            }
            table.menu {
              width: 100% !important;
            }
            table.menu td {
              width: auto !important; display: inline-block !important;
            }
            table.menu th {
              width: auto !important; display: inline-block !important;
            }
            table.menu.small-vertical td {
              display: block !important;
            }
            table.menu.small-vertical th {
              display: block !important;
            }
            table.menu.vertical td {
              display: block !important;
            }
            table.menu.vertical th {
              display: block !important;
            }
            table.menu[align=center] {
              width: auto !important;
            }
            table.button.small-expand {
              width: 100% !important;
            }
            table.button.small-expanded {
              width: 100% !important;
            }
            table.button.small-expand table {
              width: 100%;
            }
            table.button.small-expanded table {
              width: 100%;
            }
            table.button.small-expand table a {
              text-align: center !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important;
            }
            table.button.small-expanded table a {
              text-align: center !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important;
            }
            table.button.small-expand center {
              min-width: 0;
            }
            table.button.small-expanded center {
              min-width: 0;
            }
            .letter-spaced-max {
              letter-spacing: .3em !important; text-indent: 0 !important;
            }
            .hero h3 {
              margin: 0 !important; max-width: none !important;
            }
            .ways-to-shop {
              padding: 0 25px;
            }
            .wordmark img {
              margin: 0 20px !important;
            }
            .wordmark-overlay img {
              margin: 0 20px !important;
            }
            .footer td.column table.menu.vertical .menu-item {
              padding-left: 0 !important;
            }
            .footer td.columns table.menu.vertical .menu-item {
              padding-left: 0 !important;
            }
            .footer th.column table.menu.vertical .menu-item {
              padding-left: 0 !important;
            }
            .footer th.columns table.menu.vertical .menu-item {
              padding-left: 0 !important;
            }
            .footer td.column table.menu.admin .menu-item {
              padding: 0 !important;
            }
            .footer td.columns table.menu.admin .menu-item {
              padding: 0 !important;
            }
            .footer th.column table.menu.admin .menu-item {
              padding: 0 !important;
            }
            .footer th.columns table.menu.admin .menu-item {
              padding: 0 !important;
            }
            .footer .navigation .last {
              width: auto !important;
            }
            .overlay.hero h1 {
              font-size: 26px !important;
            }
            .overlay.hero h3 {
              font-size: 12px !important;
            }
          }
          @media screen and (min-device-width:1px) {
            a[href^="x-apple-data-detectors:"] {
              color: inherit !important; text-decoration: none !important;
            }
            a[href^=tel] {
              color: inherit !important; text-decoration: none !important;
            }
          }
        </style>
      </head>
      
      <body style="-moz-box-sizing: border-box; -ms-text-size-adjust: 100%; -webkit-box-sizing: border-box; -webkit-text-size-adjust: 100%; box-sizing: border-box; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; min-width: 100%; text-align: left; width: 100% !important; margin: 0; padding: 0;">
      <table
        class="body" style="border-collapse: collapse; border-spacing: 0; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; height: 100%; line-height: 1.75em; text-align: left; vertical-align: top; width: 100%; margin: 0; padding: 0;"
        bgcolor="#fff">
          <tr style="vertical-align: top; padding: 0;" align="left">
            <td class="center" align="center" valign="top" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;">
              <table align="center" class="container" style="border-collapse: collapse; border-spacing: 0; text-align: inherit; vertical-align: top; width: 700px; margin: 0 auto; padding: 0;"
              bgcolor="#fff">
                <tbody>
                  <tr style="vertical-align: top; padding: 0;" align="left">
                    <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
                    align="left" valign="top">
                      <table class="row collapse" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <th class="small-12 large-12 columns first last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 710px; margin: 0 auto; padding: 0 0 10px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left">
                                    <center data-parsed="" style="min-width: 640px; width: 100%;">
                                      <img src="https://i.ibb.co/XLxgXMn/SPDA-Vertical-Rojo.png"
                                      alt="Bienvenido a SPDA" align="center" class="float-center" style="-ms-interpolation-mode: bicubic; clear: both; display: block; max-width: 22%; outline: 0; text-align: center; text-decoration: none; width: auto; margin: 0 auto;"
                                      />
                                      <!-- <img src="${vars.banner}"
                                      alt="Bienvenido a SPDA" align="center" class="float-center" style="-ms-interpolation-mode: bicubic; clear: both; display: block; max-width: 100%; outline: 0; text-align: center; text-decoration: none; width: auto; margin: 0 auto;"
                                      /> -->
                                    </center>
                                  </th>
                                  <th class="expander" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; visibility: hidden; width: 0; margin: 0; padding: 0;"
                                  align="left"></th>
                                </tr>
                              </table>
                            </th>
                          </tr>
                        </tbody>
                      </table>
                      <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <td height="10px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 10px; font-weight: 400; hyphens: auto; line-height: 10px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
                            align="left" valign="top"> </td>
                          </tr>
                        </tbody>
                      </table>
                      <table class="spacer show-for-large" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <td height="30px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 30px; font-weight: 400; hyphens: auto; line-height: 30px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
                            align="left" valign="top"> </td>
                          </tr>
                        </tbody>
                      </table>
                      <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <th class="small-12 large-1 columns first" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 38.33px; margin: 0 auto; padding: 0 10px 10px 20px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left"></th>
                                </tr>
                              </table>
                            </th>
                            <th class="small-12 large-10 columns" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 563.33px; margin: 0 auto; padding: 0 10px 10px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="text-align: center;font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left">
                                  <h1 class="text-center serif small-text-left" style="text-align: center;color: #25368c; -webkit-hyphens: none; font-family: rubik; font-size: 35px; font-weight: bold; hyphens: none; letter-spacing: .02em; line-height: 1.1em; word-wrap: normal; margin: 0; padding: 0;"
                                  align="center">Hola! ${vars.names}</h1>
    
                                    <h5 class="text-center serif small-text-left" style="-webkit-hyphens: none; color: inherit; font-family: rubik;
                                    font-size: 15px; font-weight: 400; hyphens: none; letter-spacing: .02em; line-height: 1.1em; word-wrap: normal; "
                                    align="center">Tu código de verificación es:</h5>
                                      <!-- AQUI ESTA EL CODIGO DE VERIFICACION -->
                                    <h1 class="text-center serif small-text-left" style="-webkit-hyphens: none; color: inherit; font-family: rubik;
                                    font-size: 45px; font-weight: 400; hyphens: none; letter-spacing: .02em; line-height: 1.1em; word-wrap: normal; letter-spacing: 0.5em;"
                                    align="center">${vars.code}</h1>
                                  </th>
                                </tr>
                              </table>
                            </th>
                            <th class="small-12 large-1 columns last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 38.33px; margin: 0 auto; padding: 0 20px 10px 10px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left"></th>
                                </tr>
                              </table>
                            </th>
                          </tr>
                        </tbody>
                      </table>
                      <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <th class="small-12 large-3 columns first" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 155px; margin: 0 auto; padding: 0 10px 10px 20px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left"></th>
                                </tr>
                              </table>
                            </th>
                         
                            <th class="small-12 large-3 columns last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 155px; margin: 0 auto; padding: 0 20px 10px 10px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left"></th>
                                </tr>
                              </table>
                            </th>
                          </tr>
                        </tbody>
                      </table>
                      <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <td height="60px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 60px; font-weight: 400; hyphens: auto; line-height: 60px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
                            align="left" valign="top"> </td>
                          </tr>
                        </tbody>
                      </table>
                      
                      <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <td height="60px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 60px; font-weight: 400; hyphens: auto; line-height: 60px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
                            align="left" valign="top"> </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table align="center" class="container footer" style="border-collapse: collapse; border-spacing: 0; text-align: inherit; vertical-align: top; width: 700px; margin: 0 auto; padding: 0;"
              bgcolor="#fff">
                <tbody>
                  <tr style="vertical-align: top; padding: 0;" align="left">
                    <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
                    align="left" valign="top">
                      <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <th class="border-top small-12 large-6 columns first last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 330px; margin: 0 auto; padding: 0 20px 10px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; border-top-width: 1px; border-top-color: #c2c2c2; border-top-style: solid; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left">
                                    <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                      <tbody>
                                        <tr style="vertical-align: top; padding: 0;" align="left">
                                          <td height="40px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 40px; font-weight: 400; hyphens: auto; line-height: 40px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
                                          align="left" valign="top"> </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </th>
                                </tr>
                              </table>
                            </th>
                          </tr>
                        </tbody>
                      </table>
                      <!-- <table class="row navigation" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <th class="small-12 large-6 columns first" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 330px; margin: 0 auto; padding: 0 10px 10px 20px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left">
                                    <p style="-webkit-hyphens: none; color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; hyphens: none; line-height: 1.75em; margin: 0; padding: 0;"
                                    align="left">
                                      <img alt="Responsibly Built For The Long Haul" class="responsibly-built" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-responsibly-built-lockup.png?4921729998722299888"
                                      style="-ms-interpolation-mode: bicubic; clear: both; display: block; max-width: 100%; outline: 0; text-decoration: none; width: 190px;"
                                      />
                                    </p>
                                    <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                      <tbody>
                                        <tr style="vertical-align: top; padding: 0;" align="left">
                                          <td height="30px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 30px; font-weight: 400; hyphens: auto; line-height: 30px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
                                          align="left" valign="top"> </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </th>
                                </tr>
                              </table>
                            </th>
                            <th class="small-6 large-3 columns" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 155px; margin: 0 auto; padding: 0 10px 10px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left">
                                    <table class="menu vertical" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: auto; padding: 0;">
                                      <tr style="vertical-align: top; padding: 0;" align="left">
                                        <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
                                        align="left" valign="top">
                                          <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                            <tr style="vertical-align: top; padding: 0;" align="left">
                                              <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
                                              align="left">
                                                <a href="https://www.taylorstitch.com/collections/all-mens?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
                                                style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Shop</a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
                                              align="left">
                                                <a href="https://www.taylorstitch.com/workshop?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
                                                style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Workshop</a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
                                              align="left">
                                                <a href="https://www.taylorstitch.com/collections/mens-last-call?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
                                                style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Last Call</a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
                                              align="left">
                                                <a href="https://www.taylorstitch.com/blogs/dispatches?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
                                                style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">The Dispatch</a>
                                              </th>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </th>
                                </tr>
                              </table>
                            </th>
                            <th class="small-6 large-3 columns last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 155px; margin: 0 auto; padding: 0 20px 10px 10px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left">
                                    <table class="menu vertical" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: auto; padding: 0;">
                                      <tr style="vertical-align: top; padding: 0;" align="left">
                                        <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
                                        align="left" valign="top">
                                          <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                            <tr style="vertical-align: top; padding: 0;" align="left">
                                              <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
                                              align="left">
                                                <a href="https://www.taylorstitch.com/pages/about-us?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
                                                style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">About</a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
                                              align="left">
                                                <a href="https://www.taylorstitch.com/account?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
                                                style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Account</a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
                                              align="left">
                                                <a href="https://www.taylorstitch.com/help?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
                                                style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Help</a>
                                              </th>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </th>
                                </tr>
                              </table>
                            </th>
                          </tr>
                        </tbody>
                      </table>
                      <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <td height="30px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 30px; font-weight: 400; hyphens: auto; line-height: 30px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
                            align="left" valign="top"> </td>
                          </tr>
                        </tbody>
                      </table>
                      <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <th class="small-12 large-12 columns first last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 680px; margin: 0 auto; padding: 0 20px 10px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left">
                                    <table class="menu social first" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: auto; padding: 0;">
                                      <tr style="vertical-align: top; padding: 0;" align="left">
                                        <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
                                        align="left" valign="top">
                                          <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                            <tr style="vertical-align: top; padding: 0;" align="left">
                                              <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px 10px 10px 0;"
                                              align="left">
                                                <a href="https://www.instagram.com/taylorstitch/" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
                                                  <img alt="Instagram: @taylorstitch" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-instagram_13964307-5f03-4823-a56c-e3cf678e24c1.png?10765265317295136418"
                                                  style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
                                                  />
                                                </a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
                                              align="left">
                                                <a href="https://www.facebook.com/taylorstitchclothing" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
                                                  <img alt="Facebook: @taylorstitchclothing" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-facebook_8b79e338-a5d9-4c1e-a85f-8c006a3de733.png?10765265317295136418"
                                                  style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
                                                  />
                                                </a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
                                              align="left">
                                                <a href="https://twitter.com/taylorstitch" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
                                                  <img alt="Twitter: @TaylorStitch" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-twitter_004bd81c-a43e-4dff-8df4-eae827a2e956.png?10765265317295136418"
                                                  style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
                                                  />
                                                </a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
                                              align="left">
                                                <a href="https://www.pinterest.com/taylorstitch/" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
                                                  <img alt="Pinterest: @taylorstitch" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-pinterest.png?10765265317295136418"
                                                  style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
                                                  />
                                                </a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
                                              align="left">
                                                <a href="/taylorstitch/images/1" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
                                                  <img alt="VSCO: @taylorstitch" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-vsco.png?12714427464042413048"
                                                  style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
                                                  />
                                                </a>
                                              </th>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </th>
                                  <th class="expander" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; visibility: hidden; width: 0; margin: 0; padding: 0;"
                                  align="left"></th>
                                </tr>
                              </table>
                            </th>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table align="center" class="container footer" style="border-collapse: collapse; border-spacing: 0; text-align: inherit; vertical-align: top; width: 700px; margin: 0 auto; padding: 0;"
              bgcolor="#fff">
                <tbody>
                  <tr style="vertical-align: top; padding: 0;" align="left">
                    <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
                    align="left" valign="top">
                      <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                        <tbody>
                          <tr style="vertical-align: top; padding: 0;" align="left">
                            <th class="small-12 large-12 columns first last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 680px; margin: 0 auto; padding: 0 20px 10px;"
                            align="left">
                              <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                <tr style="vertical-align: top; padding: 0;" align="left">
                                  <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
                                  align="left">
                                    <table class="menu admin small-vertical" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: auto; padding: 0;">
                                      <tr style="vertical-align: top; padding: 0;" align="left">
                                        <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
                                        align="left" valign="top">
                                          <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
                                            <tr style="vertical-align: top; padding: 0;" align="left">
                                              <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px 10px 10px 0;"
                                              align="left">
                                                <a href="https://www.taylorstitch.com/tools/communication-preferences?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite&amp;tsio_uid=2398595743901"
                                                style="color: #c2c2c2; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">manage preferences <span class="show-for-large" style="padding-left: 20px;">|</span>
                                                </a>
                                              </th>
                                              <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
                                              align="left">
                                                <a href="https://www.taylorstitch.com/tools/communication-preferences?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite&amp;tsio_uid=2398595743901"
                                                style="color: #c2c2c2; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">unsubscribe</a>
                                              </th>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </th>
                                  <th class="expander" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; visibility: hidden; width: 0; margin: 0; padding: 0;"
                                  align="left"></th>
                                </tr>
                              </table>
                            </th>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table> -->
            </td>
          </tr>
          </table>
          <!-- prevent Gmail on iOS font size manipulation -->
          <div style="display: none; white-space: nowrap; font: 15px courier;">                                                           </div>
      </body>
    
    </html>
    `;
};

// export const template_send_requerimiento = (vars: ITemplate) => {
//   return `
//     <!DOCTYPE html>
//     <html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
//     <head>
//         <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
//         <meta name="viewport" content="initial-scale=1.0">
//         <meta name="format-detection" content="telephone=no">
//         <title>Solicitud Aprobada</title>
//         <style type="text/css">
//             body {
//                 margin: 0;
//                 padding: 0;
//             }
//             img {
//                 border: 0px;
//                 display: block;
//             }
//             .socialLinks {
//                 font-size: 6px;
//             }
//             .socialLinks a {
//                 display: inline-block;
//             }
//             .long-text p {
//                 margin: 1em 0px;
//             }
//             .long-text p:last-child {
//                 margin-bottom: 0px;
//             }
//             .long-text p:first-child {
//                 margin-top: 0px;
//             }
//         </style>
//         <style type="text/css">
//             /* yahoo, hotmail */
//             .ExternalClass,
//             .ExternalClass p,
//             .ExternalClass span,
//             .ExternalClass font,
//             .ExternalClass td,
//             .ExternalClass div {
//                 line-height: 100%;
//             }
//             .yshortcuts a {
//                 border-bottom: none !important;
//             }
//             .vb-outer {
//                 min-width: 0 !important;
//             }
//             .RMsgBdy,
//             .ExternalClass {
//                 width: 100%;
//                 background-color: #3f3f3f;
//                 background-color: #3f3f3f
//             }
//             /* outlook/office365 add buttons outside not-linked images and safari have 2px margin */
//             [o365] button {
//                 margin: 0 !important;
//             }
//             /* outlook */
//             table {
//                 mso-table-rspace: 0pt;
//                 mso-table-lspace: 0pt;
//             }
//             #outlook a {
//                 padding: 0;
//             }
//             img {
//                 outline: none;
//                 text-decoration: none;
//                 border: none;
//                 -ms-interpolation-mode: bicubic;
//             }
//             a img {
//                 border: none;
//             }
//             @media screen and (max-width: 600px) {
//                 table.vb-container,
//                 table.vb-row {
//                     width: 95% !important;
//                 }
//                 .mobile-hide {
//                     display: none !important;
//                 }
//                 .mobile-textcenter {
//                     text-align: center !important;
//                 }
//                 .mobile-full {
//                     width: 100% !important;
//                     max-width: none !important;
//                 }
//             }
//             /* previously used also screen and (max-device-width: 600px) but Yahoo Mail doesn't support multiple queries */
//         </style>
//         <style type="text/css">
//             #ko_textBlock_4 .links-color a,
//             #ko_textBlock_4 .links-color a:link,
//             #ko_textBlock_4 .links-color a:visited,
//             #ko_textBlock_4 .links-color a:hover {
//                 color: #3f3f3f;
//                 color: #3f3f3f;
//                 text-decoration: underline
//             }
//             #ko_footerBlock_2 .links-color a,
//             #ko_footerBlock_2 .links-color a:link,
//             #ko_footerBlock_2 .links-color a:visited,
//             #ko_footerBlock_2 .links-color a:hover {
//                 color: #cccccc;
//                 color: #cccccc;
//                 text-decoration: underline
//             }
//         </style>
//     </head>
//     <body bgcolor="#fff" text="#919191" alink="#cccccc" vlink="#cccccc" style="margin: 0; padding: 0; background-color: #fff; color: #919191;">
//         <center>
//             <!-- preheaderBlock -->
//             <!-- /preheaderBlock -->
//             <table class="vb-outer" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
//                 id="ko_logoBlock_3">
//                 <tbody>
//                     <tr>
//                         <td class="vb-outer" align="center" valign="top" style=" padding-left: 9px; padding-right: 9px; font-size: 0;">
//                             <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
//                             <!--
//           -->
//                             <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
//                                 <table border="0" cellpadding="0" cellspacing="9" bgcolor="#ffffff" width="570" class="vb-row" style="border-collapse: separate; width: 100%; background: #ffffff; border-top-left-radius:50px; border-top-right-radius:50px; mso-cellspacing: 9px; border-spacing: 9px; max-width: 570px; -mru-width: 0px;">
//                                     <tbody>
//                                         <tr>
//                                             <td align="center" valign="top" style="font-size: 0;">
//                                                 <div style="display: inline-block; vertical-align: top; width: 100%; max-width: 276px; -mru-width: 0px;">
//                                                     <!--
//             -->
//                                                     <table class="vb-content" border="0" cellspacing="9" cellpadding="0" width="276" style="border-collapse: separate; width: 100%; mso-cellspacing: 9px; border-spacing: 9px;">
//                                                         <!-- TODO nel template originale abbiamo anche un font-size: 18px, externalTextStyle.size ... -->
//                                                         <tbody>
//                                                             <tr>
//                                                                 <td width="100%" valign="top" align="center" class="links-color" style="">
//                                                                     <!--[if (lte ie 8)]><div style="display: inline-block; width: 258px; -mru-width: 0px;"><![endif]-->
//                                                                     <img alt="" border="0" hspace="0" align="center" vspace="0" width="258" style="display: block; vertical-align: top; height: auto; margin: 0 auto; color: #3f3f3f; font-size: 13px; font-family: Arial, Helvetica, sans-serif; width: 100%; max-width: 70px; height: auto;border: 1px solid white; border-radius: 8px;"
//                                                                         src="https://i.ibb.co/XLxgXMn/SPDA-Vertical-Rojo.png">
//                                                                     <!--[if (lte ie 8)]></div><![endif]-->
//                                                                 </td>
//                                                             </tr>
//                                                         </tbody>
//                                                     </table>
//                                                 </div>
//                                             </td>
//                                         </tr>
//                                     </tbody>
//                                 </table>
//                             </div>
//                             <!--
//         -->
//                             <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
//                         </td>
//                     </tr>
//                 </tbody>
//             </table>
//             <table class="vb-outer" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
//                 id="ko_textBlock_4">
//                 <tbody>
//                     <tr>
//                         <td class="vb-outer" align="center" valign="top" style="padding-left: 9px; padding-right: 9px; font-size: 0;">
//                             <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
//                             <!--
//           -->
//                             <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
//                                 <table border="0" cellpadding="0" cellspacing="18" bgcolor="#ffffff" width="570" class="vb-container" style="border-collapse: separate; width: 100%; background-color: #ffffff; mso-cellspacing: 18px; border-spacing: 18px; max-width: 570px; -mru-width: 0px;">
//                                     <tbody>
//                                         <tr>
//                                             <td class="long-text links-color" width="100%" valign="top" align="left" style="font-weight: normal; color: #3f3f3f; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: left; line-height: normal;">
//                                                 <p style="margin: 1em 0px; margin-top: 0px;"><strong>¡Hola ${
//                                                   vars.names
//                                                 }!</strong></p>
//                                                 <p style="margin: 1em 0px; margin-top: 0px;">Hay un requerimiento esperando por revision.</p>
//                                                 <!-- <p style="margin: 1em 0px; margin-top: 0px;">Presiona el botón para continuar:</p> -->
//                                                 <p align="center" style="padding-top: 10px; padding-bottom: 10px;"><a style="border-radius: 10px; text-decoration: none; font-weight: normal; padding: 8px; background-color: #ac2c34; color: #ffffff; width:200px;font-size: 15px; font-family: Arial, Helvetica, sans-serif;"
//                                                     target="_new" href="${
//                                                       vars.redirect_buttom
//                                                     }">Revisar Ahora</a></p>
//                                                 <!-- <p>En caso no puedas ingresar desde el botón, copia este link en tu navegador:</p> -->
//                                                 <!-- <p style="margin: 1em 0px;">${
//                                                   vars.redirect_buttom
//                                                 }</p> -->
//                                             </td>
//                                         </tr>
//                                     </tbody>
//                                 </table>
//                             </div>
//                             <!--
//         -->
//                             <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
//                         </td>
//                     </tr>
//                 </tbody>
//             </table>
//             <!-- footerBlock -->
//             <table class="vb-outer" style="margin-top: 25px;" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
//                 id="ko_preheaderBlock_1">
//                 <tbody>
//                     <tr>
//                         <td class="vb-outer" align="center" valign="top" style="padding-left: 9px; padding-right: 9px; font-size: 0;">
//                             <div style="font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;"></div>
//                             <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
//                             <!--
//           -->
//                             <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
//                                 <table border="0" cellpadding="0" cellspacing="0" style="background:#ac2c34; border-bottom-left-radius:50px; border-bottom-right-radius:50px; border-collapse: separate; width: 100%; mso-cellspacing: 0px; border-spacing: 0px; max-width: 570px; -mru-width: 0px;"
//                                     width="570" class="vb-row">
//                                     <tbody>
//                                         <tr>
//                                             <td align="center" valign="top" style="font-size: 0; padding: 0 9px;">
//                                                 <div style="width: 100%; max-width: 552px; -mru-width: 0px;">
//                                                     <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="552"><tr><![endif]-->
//                                                     <!--
//             -->
//                                                     <!--
//               -->
//                                                     <!--[if (gte mso 9)|(lte ie 8)]><td align="left" valign="top" width="276"><![endif]-->
//                                                     <!--
//           -->
//                                                     <!--[if (gte mso 9)|(lte ie 8)]></td><![endif]-->
//                                                     <!--
//               -->
//                                                     <!--[if (gte mso 9)|(lte ie 8)]><td align="left" valign="top" width="276" class="mobile-hide"><![endif]-->
//                                                     <!--
//           -->
//                                                     <div class="mobile-full mobile-hide" style="display: inline-block; vertical-align: top; width: 100%; max-width: 276px; -mru-width: 0px; min-width: calc(50%); max-width: calc(100%);">
//                                                         <!--
//             -->
//                                                         <table class="vb-content" border="0" cellspacing="9" cellpadding="0" style="border-collapse: separate; width: 100%; mso-cellspacing: 9px; border-spacing: 9px;"
//                                                             >
//                                                             <tbody>
//                                                                 <tr>
//                                                                     <td width="100%" valign="top" align="center" style="font-weight: normal; color: #ffffff; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: center;">
//                                                                         <a href="%5Bshow_link%5D" style="color: #ffffff; text-decoration: underline;display: block;padding: 5px;" target="_new">SPDA ${new Date().getFullYear()} Todos los derechos reservados</a>
//                                                                     </td>
//                                                                 </tr>
//                                                             </tbody>
//                                                         </table>
//                                                         <!--
//           -->
//                                                     </div>
//                                                     <!--[if (gte mso 9)|(lte ie 8)]></td><![endif]-->
//                                                     <!--
//             -->
//                                                     <!--
//           -->
//                                                     <!--[if (gte mso 9)|(lte ie 8)]></tr></table><![endif]-->
//                                                 </div>
//                                             </td>
//                                         </tr>
//                                     </tbody>
//                                 </table>
//                             </div>
//                             <!--
//         -->
//                             <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
//                         </td>
//                     </tr>
//                 </tbody>
//             </table>
//             <!-- /footerBlock -->
//         </center>
//     </body>
//     </html>
//     `;
// };

// export const template_rejectOrAprove_requerimiento = (vars: ITemplate) => {
//   return `
//     <!DOCTYPE html>
//   <html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
//   <head>
//       <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
//       <meta name="viewport" content="initial-scale=1.0">
//       <meta name="format-detection" content="telephone=no">
//       <title>Solicitud Aprobada</title>
//       <style type="text/css">
//           body {
//               margin: 0;
//               padding: 0;
//           }
//           img {
//               border: 0px;
//               display: block;
//           }
//           .socialLinks {
//               font-size: 6px;
//           }
//           .socialLinks a {
//               display: inline-block;
//           }
//           .long-text p {
//               margin: 1em 0px;
//           }
//           .long-text p:last-child {
//               margin-bottom: 0px;
//           }
//           .long-text p:first-child {
//               margin-top: 0px;
//           }
//       </style>
//       <style type="text/css">
//           /* yahoo, hotmail */
//           .ExternalClass,
//           .ExternalClass p,
//           .ExternalClass span,
//           .ExternalClass font,
//           .ExternalClass td,
//           .ExternalClass div {
//               line-height: 100%;
//           }
//           .yshortcuts a {
//               border-bottom: none !important;
//           }
//           .vb-outer {
//               min-width: 0 !important;
//           }
//           .RMsgBdy,
//           .ExternalClass {
//               width: 100%;
//               background-color: #3f3f3f;
//               background-color: #3f3f3f
//           }
//           /* outlook/office365 add buttons outside not-linked images and safari have 2px margin */
//           [o365] button {
//               margin: 0 !important;
//           }
//           /* outlook */
//           table {
//               mso-table-rspace: 0pt;
//               mso-table-lspace: 0pt;
//           }
//           #outlook a {
//               padding: 0;
//           }
//           img {
//               outline: none;
//               text-decoration: none;
//               border: none;
//               -ms-interpolation-mode: bicubic;
//           }
//           a img {
//               border: none;
//           }
//           @media screen and (max-width: 600px) {
//               table.vb-container,
//               table.vb-row {
//                   width: 95% !important;
//               }
//               .mobile-hide {
//                   display: none !important;
//               }
//               .mobile-textcenter {
//                   text-align: center !important;
//               }
//               .mobile-full {
//                   width: 100% !important;
//                   max-width: none !important;
//               }
//           }
//           /* previously used also screen and (max-device-width: 600px) but Yahoo Mail doesn't support multiple queries */
//       </style>
//       <style type="text/css">
//           #ko_textBlock_4 .links-color a,
//           #ko_textBlock_4 .links-color a:link,
//           #ko_textBlock_4 .links-color a:visited,
//           #ko_textBlock_4 .links-color a:hover {
//               color: #3f3f3f;
//               color: #3f3f3f;
//               text-decoration: underline
//           }
//           #ko_footerBlock_2 .links-color a,
//           #ko_footerBlock_2 .links-color a:link,
//           #ko_footerBlock_2 .links-color a:visited,
//           #ko_footerBlock_2 .links-color a:hover {
//               color: #cccccc;
//               color: #cccccc;
//               text-decoration: underline
//           }
//       </style>
//   </head>
//   <body bgcolor="#fff" text="#919191" alink="#cccccc" vlink="#cccccc" style="margin: 0; padding: 0; background-color: #fff; color: #919191;">
//       <center>
//           <!-- preheaderBlock -->
//           <!-- /preheaderBlock -->
//           <table class="vb-outer" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
//               id="ko_logoBlock_3">
//               <tbody>
//                   <tr>
//                       <td class="vb-outer" align="center" valign="top" style=" padding-left: 9px; padding-right: 9px; font-size: 0;">
//                           <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
//                           <!--
//         -->
//                           <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
//                               <table border="0" cellpadding="0" cellspacing="9" bgcolor="#ffffff" width="570" class="vb-row" style="border-collapse: separate; width: 100%; background: #ffffff; border-top-left-radius:50px; border-top-right-radius:50px; mso-cellspacing: 9px; border-spacing: 9px; max-width: 570px; -mru-width: 0px;">
//                                   <tbody>
//                                       <tr>
//                                           <td align="center" valign="top" style="font-size: 0;">
//                                               <div style="display: inline-block; vertical-align: top; width: 100%; max-width: 276px; -mru-width: 0px;">
//                                                   <!--
//           -->
//                                                   <table class="vb-content" border="0" cellspacing="9" cellpadding="0" width="276" style="border-collapse: separate; width: 100%; mso-cellspacing: 9px; border-spacing: 9px;">
//                                                       <!-- TODO nel template originale abbiamo anche un font-size: 18px, externalTextStyle.size ... -->
//                                                       <tbody>
//                                                           <tr>
//                                                               <td width="100%" valign="top" align="center" class="links-color" style="">
//                                                                   <!--[if (lte ie 8)]><div style="display: inline-block; width: 258px; -mru-width: 0px;"><![endif]-->
//                                                                   <img alt="" border="0" hspace="0" align="center" vspace="0" width="258" style="display: block; vertical-align: top; height: auto; margin: 0 auto; color: #3f3f3f; font-size: 13px; font-family: Arial, Helvetica, sans-serif; width: 100%; max-width: 70px; height: auto;border: 1px solid white; border-radius: 8px;"
//                                                                       src="https://i.ibb.co/XLxgXMn/SPDA-Vertical-Rojo.png">
//                                                                   <!--[if (lte ie 8)]></div><![endif]-->
//                                                               </td>
//                                                           </tr>
//                                                       </tbody>
//                                                   </table>
//                                               </div>
//                                           </td>
//                                       </tr>
//                                   </tbody>
//                               </table>
//                           </div>
//                           <!--
//       -->
//                           <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
//                       </td>
//                   </tr>
//               </tbody>
//           </table>
//           <table class="vb-outer" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
//               id="ko_textBlock_4">
//               <tbody>
//                   <tr>
//                       <td class="vb-outer" align="center" valign="top" style="padding-left: 9px; padding-right: 9px; font-size: 0;">
//                           <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
//                           <!--
//         -->
//                           <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
//                               <table border="0" cellpadding="0" cellspacing="18" bgcolor="#ffffff" width="570" class="vb-container" style="border-collapse: separate; width: 100%; background-color: #ffffff; mso-cellspacing: 18px; border-spacing: 18px; max-width: 570px; -mru-width: 0px;">
//                                   <tbody>
//                                       <tr>
//                                           <td class="long-text links-color" width="100%" valign="top" align="left" style="font-weight: normal; color: #3f3f3f; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: left; line-height: normal;">
//                                               <p style="margin: 1em 0px; margin-top: 0px;"><strong>¡Hola ${
//                                                 vars.names
//                                               }!</strong></p>
//                                               <p style="margin: 1em 0px; margin-top: 0px;">${
//                                                 vars.description
//                                               }</p>
//                                               <!-- <p style="margin: 1em 0px; margin-top: 0px;">Presiona el botón para continuar:</p> -->
//                                               <!-- <p align="center" style="padding-top: 10px; padding-bottom: 10px;"><a style="border-radius: 10px; text-decoration: none; font-weight: normal; padding: 8px; background-color: #ac2c34; color: #ffffff; width:200px;font-size: 15px; font-family: Arial, Helvetica, sans-serif;"
//                                                   target="_new" href="${
//                                                     vars.redirect_buttom
//                                                   }">Revisar Ahora</a></p> -->
//                                               <!-- <p>En caso no puedas ingresar desde el botón, copia este link en tu navegador:</p> -->
//                                               <!-- <p style="margin: 1em 0px;">${
//                                                 vars.redirect_buttom
//                                               }</p> -->
//                                           </td>
//                                       </tr>
//                                   </tbody>
//                               </table>
//                           </div>
//                           <!--
//       -->
//                           <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
//                       </td>
//                   </tr>
//               </tbody>
//           </table>
//           <!-- footerBlock -->
//           <table class="vb-outer" style="margin-top: 25px;" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
//               id="ko_preheaderBlock_1">
//               <tbody>
//                   <tr>
//                       <td class="vb-outer" align="center" valign="top" style="padding-left: 9px; padding-right: 9px; font-size: 0;">
//                           <div style="font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;"></div>
//                           <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
//                           <!--
//         -->
//                           <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
//                               <table border="0" cellpadding="0" cellspacing="0" style="background:#ac2c34; border-bottom-left-radius:50px; border-bottom-right-radius:50px; border-collapse: separate; width: 100%; mso-cellspacing: 0px; border-spacing: 0px; max-width: 570px; -mru-width: 0px;"
//                                   width="570" class="vb-row">
//                                   <tbody>
//                                       <tr>
//                                           <td align="center" valign="top" style="font-size: 0; padding: 0 9px;">
//                                               <div style="width: 100%; max-width: 552px; -mru-width: 0px;">
//                                                   <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="552"><tr><![endif]-->
//                                                   <!--
//           -->
//                                                   <!--
//             -->
//                                                   <!--[if (gte mso 9)|(lte ie 8)]><td align="left" valign="top" width="276"><![endif]-->
//                                                   <!--
//         -->
//                                                   <!--[if (gte mso 9)|(lte ie 8)]></td><![endif]-->
//                                                   <!--
//             -->
//                                                   <!--[if (gte mso 9)|(lte ie 8)]><td align="left" valign="top" width="276" class="mobile-hide"><![endif]-->
//                                                   <!--
//         -->
//                                                   <div class="mobile-full mobile-hide" style="display: inline-block; vertical-align: top; width: 100%; max-width: 276px; -mru-width: 0px; min-width: calc(50%); max-width: calc(100%);">
//                                                       <!--
//           -->
//                                                       <table class="vb-content" border="0" cellspacing="9" cellpadding="0" style="border-collapse: separate; width: 100%; mso-cellspacing: 9px; border-spacing: 9px;"
//                                                           >
//                                                           <tbody>
//                                                               <tr>
//                                                                   <td width="100%" valign="top" align="center" style="font-weight: normal; color: #ffffff; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: center;">
//                                                                       <a href="%5Bshow_link%5D" style="color: #ffffff; text-decoration: underline;display: block;padding: 5px;" target="_new">SPDA ${new Date().getFullYear()} Todos los derechos reservados</a>
//                                                                   </td>
//                                                               </tr>
//                                                           </tbody>
//                                                       </table>
//                                                       <!--
//         -->
//                                                   </div>
//                                                   <!--[if (gte mso 9)|(lte ie 8)]></td><![endif]-->
//                                                   <!--
//           -->
//                                                   <!--
//         -->
//                                                   <!--[if (gte mso 9)|(lte ie 8)]></tr></table><![endif]-->
//                                               </div>
//                                           </td>
//                                       </tr>
//                                   </tbody>
//                               </table>
//                           </div>
//                           <!--
//       -->
//                           <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
//                       </td>
//                   </tr>
//               </tbody>
//           </table>
//           <!-- /footerBlock -->
//       </center>
//   </body>
//   </html>
//     `;
// };

// export const template_supplier_automati = (vars: ITemplateSupplier) => {
//   return `

//     <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
//     <html xmlns="http://www.w3.org/1999/xhtml" xmlns="http://www.w3.org/1999/xhtml"
//     lang="en" xml:lang="en" style="min-height: 100%; background-color: #fff;" xml:lang="en">

//       <head>
//         <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
//         <meta name="viewport" content="width=device-width" />
//         <meta name="format-detection" content="date=no" />
//         <meta name="format-detection" content="telephone=no" />
//         <title>Welcome to Taylor Stitch Mens</title>
//         <style>
//           @media only screen and (max-width:720px) {
//             .small-float-center {
//               margin: 0 auto !important; float: none !important; text-align: center !important;
//             }
//             .small-text-center {
//               text-align: center !important;
//             }
//             .small-text-left {
//               text-align: left !important;
//             }
//             .small-text-right {
//               text-align: right !important;
//             }
//             .hide-for-large {
//               display: block !important; width: auto !important; overflow: visible !important; max-height: none !important; font-size: inherit !important; line-height: inherit !important;
//             }
//             table.body table.container .hide-for-large {
//               display: table !important; width: 100% !important;
//             }
//             table.body table.container .row.hide-for-large {
//               display: table !important; width: 100% !important;
//             }
//             table.body table.container .callout-inner.hide-for-large {
//               display: table-cell !important; width: 100% !important;
//             }
//             table.body table.container .show-for-large {
//               display: none !important; width: 0; mso-hide: all; overflow: hidden;
//             }
//             table.body img {
//               width: auto; height: auto;
//             }
//             table.body center {
//               min-width: 0 !important;
//             }
//             table.body .container {
//               width: 100% !important;
//             }
//             table.body .column {
//               height: auto !important; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box; padding-left: 20px !important; padding-right: 20px !important;
//             }
//             table.body .columns {
//               height: auto !important; -moz-box-sizing: border-box; -webkit-box-sizing: border-box; box-sizing: border-box; padding-left: 20px !important; padding-right: 20px !important;
//             }
//             table.body .column .column {
//               padding-left: 0 !important; padding-right: 0 !important;
//             }
//             table.body .column .columns {
//               padding-left: 0 !important; padding-right: 0 !important;
//             }
//             table.body .columns .column {
//               padding-left: 0 !important; padding-right: 0 !important;
//             }
//             table.body .columns .columns {
//               padding-left: 0 !important; padding-right: 0 !important;
//             }
//             table.body .collapse .column {
//               padding-left: 0 !important; padding-right: 0 !important;
//             }
//             table.body .collapse .columns {
//               padding-left: 0 !important; padding-right: 0 !important;
//             }
//             td.small-1 {
//               display: inline-block !important; width: 8.33333% !important;
//             }
//             th.small-1 {
//               display: inline-block !important; width: 8.33333% !important;
//             }
//             td.small-2 {
//               display: inline-block !important; width: 16.66667% !important;
//             }
//             th.small-2 {
//               display: inline-block !important; width: 16.66667% !important;
//             }
//             td.small-3 {
//               display: inline-block !important; width: 25% !important;
//             }
//             th.small-3 {
//               display: inline-block !important; width: 25% !important;
//             }
//             td.small-4 {
//               display: inline-block !important; width: 33.33333% !important;
//             }
//             th.small-4 {
//               display: inline-block !important; width: 33.33333% !important;
//             }
//             td.small-5 {
//               display: inline-block !important; width: 41.66667% !important;
//             }
//             th.small-5 {
//               display: inline-block !important; width: 41.66667% !important;
//             }
//             td.small-6 {
//               display: inline-block !important; width: 50% !important;
//             }
//             th.small-6 {
//               display: inline-block !important; width: 50% !important;
//             }
//             td.small-7 {
//               display: inline-block !important; width: 58.33333% !important;
//             }
//             th.small-7 {
//               display: inline-block !important; width: 58.33333% !important;
//             }
//             td.small-8 {
//               display: inline-block !important; width: 66.66667% !important;
//             }
//             th.small-8 {
//               display: inline-block !important; width: 66.66667% !important;
//             }
//             td.small-9 {
//               display: inline-block !important; width: 75% !important;
//             }
//             th.small-9 {
//               display: inline-block !important; width: 75% !important;
//             }
//             td.small-10 {
//               display: inline-block !important; width: 83.33333% !important;
//             }
//             th.small-10 {
//               display: inline-block !important; width: 83.33333% !important;
//             }
//             td.small-11 {
//               display: inline-block !important; width: 91.66667% !important;
//             }
//             th.small-11 {
//               display: inline-block !important; width: 91.66667% !important;
//             }
//             td.small-12 {
//               display: inline-block !important; width: 100% !important;
//             }
//             th.small-12 {
//               display: inline-block !important; width: 100% !important;
//             }
//             .column td.small-12 {
//               display: block !important; width: 100% !important;
//             }
//             .column th.small-12 {
//               display: block !important; width: 100% !important;
//             }
//             .columns td.small-12 {
//               display: block !important; width: 100% !important;
//             }
//             .columns th.small-12 {
//               display: block !important; width: 100% !important;
//             }
//             table.body td.small-offset-1 {
//               margin-left: 8.33333% !important;
//             }
//             table.body th.small-offset-1 {
//               margin-left: 8.33333% !important;
//             }
//             table.body td.small-offset-2 {
//               margin-left: 16.66667% !important;
//             }
//             table.body th.small-offset-2 {
//               margin-left: 16.66667% !important;
//             }
//             table.body td.small-offset-3 {
//               margin-left: 25% !important;
//             }
//             table.body th.small-offset-3 {
//               margin-left: 25% !important;
//             }
//             table.body td.small-offset-4 {
//               margin-left: 33.33333% !important;
//             }
//             table.body th.small-offset-4 {
//               margin-left: 33.33333% !important;
//             }
//             table.body td.small-offset-5 {
//               margin-left: 41.66667% !important;
//             }
//             table.body th.small-offset-5 {
//               margin-left: 41.66667% !important;
//             }
//             table.body td.small-offset-6 {
//               margin-left: 50% !important;
//             }
//             table.body th.small-offset-6 {
//               margin-left: 50% !important;
//             }
//             table.body td.small-offset-7 {
//               margin-left: 58.33333% !important;
//             }
//             table.body th.small-offset-7 {
//               margin-left: 58.33333% !important;
//             }
//             table.body td.small-offset-8 {
//               margin-left: 66.66667% !important;
//             }
//             table.body th.small-offset-8 {
//               margin-left: 66.66667% !important;
//             }
//             table.body td.small-offset-9 {
//               margin-left: 75% !important;
//             }
//             table.body th.small-offset-9 {
//               margin-left: 75% !important;
//             }
//             table.body td.small-offset-10 {
//               margin-left: 83.33333% !important;
//             }
//             table.body th.small-offset-10 {
//               margin-left: 83.33333% !important;
//             }
//             table.body td.small-offset-11 {
//               margin-left: 91.66667% !important;
//             }
//             table.body th.small-offset-11 {
//               margin-left: 91.66667% !important;
//             }
//             table.body table.columns td.expander {
//               display: none !important;
//             }
//             table.body table.columns th.expander {
//               display: none !important;
//             }
//             table.body .right-text-pad {
//               padding-left: 10px !important;
//             }
//             table.body .text-pad-right {
//               padding-left: 10px !important;
//             }
//             table.body .left-text-pad {
//               padding-right: 10px !important;
//             }
//             table.body .text-pad-left {
//               padding-right: 10px !important;
//             }
//             table.menu {
//               width: 100% !important;
//             }
//             table.menu td {
//               width: auto !important; display: inline-block !important;
//             }
//             table.menu th {
//               width: auto !important; display: inline-block !important;
//             }
//             table.menu.small-vertical td {
//               display: block !important;
//             }
//             table.menu.small-vertical th {
//               display: block !important;
//             }
//             table.menu.vertical td {
//               display: block !important;
//             }
//             table.menu.vertical th {
//               display: block !important;
//             }
//             table.menu[align=center] {
//               width: auto !important;
//             }
//             table.button.small-expand {
//               width: 100% !important;
//             }
//             table.button.small-expanded {
//               width: 100% !important;
//             }
//             table.button.small-expand table {
//               width: 100%;
//             }
//             table.button.small-expanded table {
//               width: 100%;
//             }
//             table.button.small-expand table a {
//               text-align: center !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important;
//             }
//             table.button.small-expanded table a {
//               text-align: center !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important;
//             }
//             table.button.small-expand center {
//               min-width: 0;
//             }
//             table.button.small-expanded center {
//               min-width: 0;
//             }
//             .letter-spaced-max {
//               letter-spacing: .3em !important; text-indent: 0 !important;
//             }
//             .hero h3 {
//               margin: 0 !important; max-width: none !important;
//             }
//             .ways-to-shop {
//               padding: 0 25px;
//             }
//             .wordmark img {
//               margin: 0 20px !important;
//             }
//             .wordmark-overlay img {
//               margin: 0 20px !important;
//             }
//             .footer td.column table.menu.vertical .menu-item {
//               padding-left: 0 !important;
//             }
//             .footer td.columns table.menu.vertical .menu-item {
//               padding-left: 0 !important;
//             }
//             .footer th.column table.menu.vertical .menu-item {
//               padding-left: 0 !important;
//             }
//             .footer th.columns table.menu.vertical .menu-item {
//               padding-left: 0 !important;
//             }
//             .footer td.column table.menu.admin .menu-item {
//               padding: 0 !important;
//             }
//             .footer td.columns table.menu.admin .menu-item {
//               padding: 0 !important;
//             }
//             .footer th.column table.menu.admin .menu-item {
//               padding: 0 !important;
//             }
//             .footer th.columns table.menu.admin .menu-item {
//               padding: 0 !important;
//             }
//             .footer .navigation .last {
//               width: auto !important;
//             }
//             .overlay.hero h1 {
//               font-size: 26px !important;
//             }
//             .overlay.hero h3 {
//               font-size: 12px !important;
//             }
//           }
//           @media screen and (min-device-width:1px) {
//             a[href^="x-apple-data-detectors:"] {
//               color: inherit !important; text-decoration: none !important;
//             }
//             a[href^=tel] {
//               color: inherit !important; text-decoration: none !important;
//             }
//           }
//         </style>
//       </head>

//       <body style="-moz-box-sizing: border-box; -ms-text-size-adjust: 100%; -webkit-box-sizing: border-box; -webkit-text-size-adjust: 100%; box-sizing: border-box; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; min-width: 100%; text-align: left; width: 100% !important; margin: 0; padding: 0;">
//       <table
//         class="body" style="border-collapse: collapse; border-spacing: 0; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; height: 100%; line-height: 1.75em; text-align: left; vertical-align: top; width: 100%; margin: 0; padding: 0;"
//         bgcolor="#fff">
//           <tr style="vertical-align: top; padding: 0;" align="left">
//             <td class="center" align="center" valign="top" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;">
//               <table align="center" class="container" style="border-collapse: collapse; border-spacing: 0; text-align: inherit; vertical-align: top; width: 700px; margin: 0 auto; padding: 0;"
//               bgcolor="#fff">
//                 <tbody>
//                   <tr style="vertical-align: top; padding: 0;" align="left">
//                     <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
//                     align="left" valign="top">
//                       <table class="row collapse" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <th class="small-12 large-12 columns first last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 710px; margin: 0 auto; padding: 0 0 10px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left">
//                                     <center data-parsed="" style="min-width: 640px; width: 100%;">
//                                       <img src="https://s3.us-south.cloud-object-storage.appdomain.cloud/tukompa/94a876d2-fc19-442b-8685-da4186134b18.png"
//                                       alt="Bienvenido a SPDA" align="center" class="float-center" style="-ms-interpolation-mode: bicubic; clear: both; display: block; max-width: 22%; outline: 0; text-align: center; text-decoration: none; width: auto; margin: 0 auto;"
//                                       />
//                                       <!-- <img src="${vars.banner}"
//                                       alt="Bienvenido a SPDA" align="center" class="float-center" style="-ms-interpolation-mode: bicubic; clear: both; display: block; max-width: 100%; outline: 0; text-align: center; text-decoration: none; width: auto; margin: 0 auto;"
//                                       /> -->
//                                     </center>
//                                   </th>
//                                   <th class="expander" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; visibility: hidden; width: 0; margin: 0; padding: 0;"
//                                   align="left"></th>
//                                 </tr>
//                               </table>
//                             </th>
//                           </tr>
//                         </tbody>
//                       </table>
//                       <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <td height="10px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 10px; font-weight: 400; hyphens: auto; line-height: 10px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
//                             align="left" valign="top"> </td>
//                           </tr>
//                         </tbody>
//                       </table>
//                       <table class="spacer show-for-large" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <td height="30px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 30px; font-weight: 400; hyphens: auto; line-height: 30px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
//                             align="left" valign="top"> </td>
//                           </tr>
//                         </tbody>
//                       </table>
//                       <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <th class="small-12 large-1 columns first" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 38.33px; margin: 0 auto; padding: 0 10px 10px 20px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left"></th>
//                                 </tr>
//                               </table>
//                             </th>
//                             <th class="small-12 large-10 columns" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 563.33px; margin: 0 auto; padding: 0 10px 10px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="text-align: center;font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left">
//                                   <h1 class="text-center serif small-text-left" style="text-align: center;color: #25368c; -webkit-hyphens: none; font-family: rubik; font-size: 35px; font-weight: bold; hyphens: none; letter-spacing: .02em; line-height: 1.1em; word-wrap: normal; margin: 0; padding: 0;"
//                                   align="center">Hola! ${vars.names}</h1>

//                                     <h5 class="text-center serif small-text-left" style="-webkit-hyphens: none; color: inherit; font-family: rubik;
//                                     font-size: 15px; font-weight: 400; hyphens: none; letter-spacing: .02em; line-height: 1.1em; word-wrap: normal; "
//                                     align="center">Aqui tienes tu link de acceso para modificar tus datos recuerda que no debes de compartir este link con nadie.:</h5>
//                                       <!-- AQUI ESTA EL CODIGO DE VERIFICACION -->
//                                     <h1 class="text-center serif small-text-left" style="-webkit-hyphens: none; color: inherit; font-family: Areal;
//                                     font-size: 45px; font-weight: 400; hyphens: none;  line-height: 1.1em; word-wrap: normal; "
//                                     align="center">${vars.url}</h1>
//                                   </th>
//                                 </tr>
//                               </table>
//                             </th>
//                             <th class="small-12 large-1 columns last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 38.33px; margin: 0 auto; padding: 0 20px 10px 10px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left"></th>
//                                 </tr>
//                               </table>
//                             </th>
//                           </tr>
//                         </tbody>
//                       </table>
//                       <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <th class="small-12 large-3 columns first" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 155px; margin: 0 auto; padding: 0 10px 10px 20px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left"></th>
//                                 </tr>
//                               </table>
//                             </th>

//                             <th class="small-12 large-3 columns last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 155px; margin: 0 auto; padding: 0 20px 10px 10px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left"></th>
//                                 </tr>
//                               </table>
//                             </th>
//                           </tr>
//                         </tbody>
//                       </table>
//                       <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <td height="60px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 60px; font-weight: 400; hyphens: auto; line-height: 60px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
//                             align="left" valign="top"> </td>
//                           </tr>
//                         </tbody>
//                       </table>

//                       <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <td height="60px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 60px; font-weight: 400; hyphens: auto; line-height: 60px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
//                             align="left" valign="top"> </td>
//                           </tr>
//                         </tbody>
//                       </table>
//                     </td>
//                   </tr>
//                 </tbody>
//               </table>
//               <table align="center" class="container footer" style="border-collapse: collapse; border-spacing: 0; text-align: inherit; vertical-align: top; width: 700px; margin: 0 auto; padding: 0;"
//               bgcolor="#fff">
//                 <tbody>
//                   <tr style="vertical-align: top; padding: 0;" align="left">
//                     <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
//                     align="left" valign="top">
//                       <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <th class="border-top small-12 large-6 columns first last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 330px; margin: 0 auto; padding: 0 20px 10px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; border-top-width: 1px; border-top-color: #c2c2c2; border-top-style: solid; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left">
//                                     <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                       <tbody>
//                                         <tr style="vertical-align: top; padding: 0;" align="left">
//                                           <td height="40px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 40px; font-weight: 400; hyphens: auto; line-height: 40px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
//                                           align="left" valign="top"> </td>
//                                         </tr>
//                                       </tbody>
//                                     </table>
//                                   </th>
//                                 </tr>
//                               </table>
//                             </th>
//                           </tr>
//                         </tbody>
//                       </table>
//                       <!-- <table class="row navigation" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <th class="small-12 large-6 columns first" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 330px; margin: 0 auto; padding: 0 10px 10px 20px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left">
//                                     <p style="-webkit-hyphens: none; color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; hyphens: none; line-height: 1.75em; margin: 0; padding: 0;"
//                                     align="left">
//                                       <img alt="Responsibly Built For The Long Haul" class="responsibly-built" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-responsibly-built-lockup.png?4921729998722299888"
//                                       style="-ms-interpolation-mode: bicubic; clear: both; display: block; max-width: 100%; outline: 0; text-decoration: none; width: 190px;"
//                                       />
//                                     </p>
//                                     <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                       <tbody>
//                                         <tr style="vertical-align: top; padding: 0;" align="left">
//                                           <td height="30px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 30px; font-weight: 400; hyphens: auto; line-height: 30px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
//                                           align="left" valign="top"> </td>
//                                         </tr>
//                                       </tbody>
//                                     </table>
//                                   </th>
//                                 </tr>
//                               </table>
//                             </th>
//                             <th class="small-6 large-3 columns" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 155px; margin: 0 auto; padding: 0 10px 10px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left">
//                                     <table class="menu vertical" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: auto; padding: 0;">
//                                       <tr style="vertical-align: top; padding: 0;" align="left">
//                                         <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
//                                         align="left" valign="top">
//                                           <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                             <tr style="vertical-align: top; padding: 0;" align="left">
//                                               <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
//                                               align="left">
//                                                 <a href="https://www.taylorstitch.com/collections/all-mens?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
//                                                 style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Shop</a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
//                                               align="left">
//                                                 <a href="https://www.taylorstitch.com/workshop?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
//                                                 style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Workshop</a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
//                                               align="left">
//                                                 <a href="https://www.taylorstitch.com/collections/mens-last-call?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
//                                                 style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Last Call</a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
//                                               align="left">
//                                                 <a href="https://www.taylorstitch.com/blogs/dispatches?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
//                                                 style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">The Dispatch</a>
//                                               </th>
//                                             </tr>
//                                           </table>
//                                         </td>
//                                       </tr>
//                                     </table>
//                                   </th>
//                                 </tr>
//                               </table>
//                             </th>
//                             <th class="small-6 large-3 columns last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 155px; margin: 0 auto; padding: 0 20px 10px 10px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left">
//                                     <table class="menu vertical" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: auto; padding: 0;">
//                                       <tr style="vertical-align: top; padding: 0;" align="left">
//                                         <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
//                                         align="left" valign="top">
//                                           <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                             <tr style="vertical-align: top; padding: 0;" align="left">
//                                               <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
//                                               align="left">
//                                                 <a href="https://www.taylorstitch.com/pages/about-us?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
//                                                 style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">About</a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
//                                               align="left">
//                                                 <a href="https://www.taylorstitch.com/account?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
//                                                 style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Account</a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; display: block; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0 0 0 10px;"
//                                               align="left">
//                                                 <a href="https://www.taylorstitch.com/help?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite"
//                                                 style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; width: 100%; margin: 0; padding: 0;">Help</a>
//                                               </th>
//                                             </tr>
//                                           </table>
//                                         </td>
//                                       </tr>
//                                     </table>
//                                   </th>
//                                 </tr>
//                               </table>
//                             </th>
//                           </tr>
//                         </tbody>
//                       </table>
//                       <table class="spacer" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <td height="30px" style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 30px; font-weight: 400; hyphens: auto; line-height: 30px; mso-line-height-rule: exactly; word-wrap: break-word; margin: 0; padding: 0;"
//                             align="left" valign="top"> </td>
//                           </tr>
//                         </tbody>
//                       </table>
//                       <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <th class="small-12 large-12 columns first last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 680px; margin: 0 auto; padding: 0 20px 10px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left">
//                                     <table class="menu social first" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: auto; padding: 0;">
//                                       <tr style="vertical-align: top; padding: 0;" align="left">
//                                         <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
//                                         align="left" valign="top">
//                                           <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                             <tr style="vertical-align: top; padding: 0;" align="left">
//                                               <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px 10px 10px 0;"
//                                               align="left">
//                                                 <a href="https://www.instagram.com/taylorstitch/" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
//                                                   <img alt="Instagram: @taylorstitch" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-instagram_13964307-5f03-4823-a56c-e3cf678e24c1.png?10765265317295136418"
//                                                   style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
//                                                   />
//                                                 </a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
//                                               align="left">
//                                                 <a href="https://www.facebook.com/taylorstitchclothing" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
//                                                   <img alt="Facebook: @taylorstitchclothing" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-facebook_8b79e338-a5d9-4c1e-a85f-8c006a3de733.png?10765265317295136418"
//                                                   style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
//                                                   />
//                                                 </a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
//                                               align="left">
//                                                 <a href="https://twitter.com/taylorstitch" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
//                                                   <img alt="Twitter: @TaylorStitch" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-twitter_004bd81c-a43e-4dff-8df4-eae827a2e956.png?10765265317295136418"
//                                                   style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
//                                                   />
//                                                 </a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
//                                               align="left">
//                                                 <a href="https://www.pinterest.com/taylorstitch/" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
//                                                   <img alt="Pinterest: @taylorstitch" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-pinterest.png?10765265317295136418"
//                                                   style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
//                                                   />
//                                                 </a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
//                                               align="left">
//                                                 <a href="/taylorstitch/images/1" style="color: #363636; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">
//                                                   <img alt="VSCO: @taylorstitch" src="https://cdn.shopify.com/s/files/1/0070/1922/files/emails-icon-vsco.png?12714427464042413048"
//                                                   style="-ms-interpolation-mode: bicubic; clear: both; display: block; height: 22px; max-width: 100%; outline: 0; text-decoration: none; width: 22px; border: none;"
//                                                   />
//                                                 </a>
//                                               </th>
//                                             </tr>
//                                           </table>
//                                         </td>
//                                       </tr>
//                                     </table>
//                                   </th>
//                                   <th class="expander" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; visibility: hidden; width: 0; margin: 0; padding: 0;"
//                                   align="left"></th>
//                                 </tr>
//                               </table>
//                             </th>
//                           </tr>
//                         </tbody>
//                       </table>
//                     </td>
//                   </tr>
//                 </tbody>
//               </table>
//               <table align="center" class="container footer" style="border-collapse: collapse; border-spacing: 0; text-align: inherit; vertical-align: top; width: 700px; margin: 0 auto; padding: 0;"
//               bgcolor="#fff">
//                 <tbody>
//                   <tr style="vertical-align: top; padding: 0;" align="left">
//                     <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
//                     align="left" valign="top">
//                       <table class="row" style="border-collapse: collapse; border-spacing: 0; display: table; position: relative; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                         <tbody>
//                           <tr style="vertical-align: top; padding: 0;" align="left">
//                             <th class="small-12 large-12 columns first last" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; width: 680px; margin: 0 auto; padding: 0 20px 10px;"
//                             align="left">
//                               <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                 <tr style="vertical-align: top; padding: 0;" align="left">
//                                   <th style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 0;"
//                                   align="left">
//                                     <table class="menu admin small-vertical" style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: auto; padding: 0;">
//                                       <tr style="vertical-align: top; padding: 0;" align="left">
//                                         <td style="-moz-hyphens: auto; -webkit-hyphens: auto; border-collapse: collapse !important; color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; hyphens: auto; line-height: 1.75em; word-wrap: break-word; margin: 0; padding: 0;"
//                                         align="left" valign="top">
//                                           <table style="border-collapse: collapse; border-spacing: 0; text-align: left; vertical-align: top; width: 100%; padding: 0;">
//                                             <tr style="vertical-align: top; padding: 0;" align="left">
//                                               <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px 10px 10px 0;"
//                                               align="left">
//                                                 <a href="https://www.taylorstitch.com/tools/communication-preferences?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite&amp;tsio_uid=2398595743901"
//                                                 style="color: #c2c2c2; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">manage preferences <span class="show-for-large" style="padding-left: 20px;">|</span>
//                                                 </a>
//                                               </th>
//                                               <th class="menu-item" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; margin: 0; padding: 10px;"
//                                               align="left">
//                                                 <a href="https://www.taylorstitch.com/tools/communication-preferences?utm_source=shopify&amp;utm_medium=email&amp;utm_campaign=account_invite&amp;tsio_uid=2398595743901"
//                                                 style="color: #c2c2c2; font-family: HelveticaNeue-Light,'Helvetica Neue Light','Helvetica Neue',Helvetica,Arial,'Lucida Grande',sans-serif; font-size: 12px; font-weight: 400; line-height: 1.75em; text-align: left; text-decoration: none; margin: 0; padding: 0;">unsubscribe</a>
//                                               </th>
//                                             </tr>
//                                           </table>
//                                         </td>
//                                       </tr>
//                                     </table>
//                                   </th>
//                                   <th class="expander" style="color: #363636; font-family: Chronicle,Georgia,Times,Times New Roman,serif; font-size: 15px; font-weight: 400; line-height: 1.75em; visibility: hidden; width: 0; margin: 0; padding: 0;"
//                                   align="left"></th>
//                                 </tr>
//                               </table>
//                             </th>
//                           </tr>
//                         </tbody>
//                       </table>
//                     </td>
//                   </tr>
//                 </tbody>
//               </table> -->
//             </td>
//           </tr>
//           </table>
//           <!-- prevent Gmail on iOS font size manipulation -->
//           <div style="display: none; white-space: nowrap; font: 15px courier;">                                                           </div>
//       </body>

//     </html>
//     `;
// };
export const template_recovery_code = (vars: ITemplate) => {
  return `
  <!DOCTYPE html>
  <html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <meta name="viewport" content="initial-scale=1.0">
      <meta name="format-detection" content="telephone=no">
      <title>Solicitud Aprobada</title>
      <style type="text/css">
          body {
              margin: 0;
              padding: 0;
          }
          img {
              border: 0px;
              display: block;
          }
          .socialLinks {
              font-size: 6px;
          }
          .socialLinks a {
              display: inline-block;
          }
          .long-text p {
              margin: 1em 0px;
          }
          .long-text p:last-child {
              margin-bottom: 0px;
          }
          .long-text p:first-child {
              margin-top: 0px;
          }
      </style>
      <style type="text/css">
          /* yahoo, hotmail */
          .ExternalClass,
          .ExternalClass p,
          .ExternalClass span,
          .ExternalClass font,
          .ExternalClass td,
          .ExternalClass div {
              line-height: 100%;
          }
          .yshortcuts a {
              border-bottom: none !important;
          }
          .vb-outer {
              min-width: 0 !important;
          }
          .RMsgBdy,
          .ExternalClass {
              width: 100%;
              background-color: #3f3f3f;
              background-color: #3f3f3f
          }
          /* outlook/office365 add buttons outside not-linked images and safari have 2px margin */
          [o365] button {
              margin: 0 !important;
          }
          /* outlook */
          table {
              mso-table-rspace: 0pt;
              mso-table-lspace: 0pt;
          }
          #outlook a {
              padding: 0;
          }
          img {
              outline: none;
              text-decoration: none;
              border: none;
              -ms-interpolation-mode: bicubic;
          }
          a img {
              border: none;
          }
          @media screen and (max-width: 600px) {
              table.vb-container,
              table.vb-row {
                  width: 95% !important;
              }
              .mobile-hide {
                  display: none !important;
              }
              .mobile-textcenter {
                  text-align: center !important;
              }
              .mobile-full {
                  width: 100% !important;
                  max-width: none !important;
              }
          }
          /* previously used also screen and (max-device-width: 600px) but Yahoo Mail doesn't support multiple queries */
      </style>
      <style type="text/css">
          #ko_textBlock_4 .links-color a,
          #ko_textBlock_4 .links-color a:link,
          #ko_textBlock_4 .links-color a:visited,
          #ko_textBlock_4 .links-color a:hover {
              color: #3f3f3f;
              color: #3f3f3f;
              text-decoration: underline
          }
          #ko_footerBlock_2 .links-color a,
          #ko_footerBlock_2 .links-color a:link,
          #ko_footerBlock_2 .links-color a:visited,
          #ko_footerBlock_2 .links-color a:hover {
              color: #cccccc;
              color: #cccccc;
              text-decoration: underline
          }
      </style>
  </head>
  <body bgcolor="#fff" text="#919191" alink="#cccccc" vlink="#cccccc" style="margin: 0; padding: 0; background-color: #fff; color: #919191;">
      <center>
          <!-- preheaderBlock -->
          <!-- /preheaderBlock -->
          <table class="vb-outer" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
              id="ko_logoBlock_3">
              <tbody>
                  <tr>
                      <td class="vb-outer" align="center" valign="top" style=" padding-left: 9px; padding-right: 9px; font-size: 0;">
                          <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
                          <!--
        -->
                          <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
                              <table border="0" cellpadding="0" cellspacing="9" bgcolor="#ffffff" width="570" class="vb-row" style="border-collapse: separate; width: 100%; background: #ffffff; border-top-left-radius:50px; border-top-right-radius:50px; mso-cellspacing: 9px; border-spacing: 9px; max-width: 570px; -mru-width: 0px;">
                                  <tbody>
                                      <tr>
                                          <td align="center" valign="top" style="font-size: 0;">
                                              <div style="display: inline-block; vertical-align: top; width: 100%; max-width: 276px; -mru-width: 0px;">
                                                  <!--
          -->
                                                  <table class="vb-content" border="0" cellspacing="9" cellpadding="0" width="276" style="border-collapse: separate; width: 100%; mso-cellspacing: 9px; border-spacing: 9px;">
                                                      <!-- TODO nel template originale abbiamo anche un font-size: 18px, externalTextStyle.size ... -->
                                                      <tbody>
                                                          <tr>
                                                              <td width="100%" valign="top" align="center" class="links-color" style="">
                                                                  <!--[if (lte ie 8)]><div style="display: inline-block; width: 258px; -mru-width: 0px;"><![endif]-->
                                                                  <img alt="" border="0" hspace="0" align="center" vspace="0" width="258" style="display: block; vertical-align: top; height: auto; margin: 0 auto; color: #3f3f3f; font-size: 13px; font-family: Arial, Helvetica, sans-serif; width: 100%; max-width: 70px; height: auto;border: 1px solid white; border-radius: 8px;"
                                                                      src="${vars.logo || ''}"/>
                                                                     
                                                                  <!--[if (lte ie 8)]></div><![endif]-->
                                                              </td>
                                                          </tr>
                                                      </tbody>
                                                  </table>
                                              </div>
                                          </td>
                                      </tr>
                                  </tbody>
                              </table>
                          </div>
                          <!--
      -->
                          <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
                      </td>
                  </tr>
              </tbody>
          </table>
          <table class="vb-outer" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
              id="ko_textBlock_4">
              <tbody>
                  <tr>
                      <td class="vb-outer" align="center" valign="top" style="padding-left: 9px; padding-right: 9px; font-size: 0;">
                          <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
                          <!--
        -->
                          <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
                              <table border="0" cellpadding="0" cellspacing="18" bgcolor="#ffffff" width="570" class="vb-container" style="border-collapse: separate; width: 100%; background-color: #ffffff; mso-cellspacing: 18px; border-spacing: 18px; max-width: 570px; -mru-width: 0px;">
                                  <tbody>
                                      <tr>
                                          <td class="long-text links-color" width="100%" valign="top" align="left" style="font-weight: normal; color: #3f3f3f; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: left; line-height: normal;">
                                              <p style="margin: 1em 0px; margin-top: 0px;"><strong>¡Hola ${
                                                vars.names
                                              }!</strong></p>
                                             
                                              <p style="margin: 1em 0px; margin-top: 0px;">Tu código de verificación es: <strong>${
                                                vars.code
                                              }</strong></p>
                                            
                                          </td>
                                      </tr>
                                  </tbody>
                              </table>
                          </div>
                          <!--
      -->
                          <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
                      </td>
                  </tr>
              </tbody>
          </table>
          <!-- footerBlock -->
          <table class="vb-outer" style="margin-top: 25px;" width="100%" cellpadding="0" border="0" cellspacing="0" bgcolor="#fff" style="background-color: #fff;"
              id="ko_preheaderBlock_1">
              <tbody>
                  <tr>
                      <td class="vb-outer" align="center" valign="top" style="padding-left: 9px; padding-right: 9px; font-size: 0;">
                          <div style="font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;"></div>
                          <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="570"><tr><td align="center" valign="top"><![endif]-->
                          <!--
        -->
                          <div style="margin: 0 auto; max-width: 570px; -mru-width: 0px;">
                              <table border="0" cellpadding="0" cellspacing="0" style="background:${
                                vars.s_color
                              }; border-bottom-left-radius:50px; border-bottom-right-radius:50px; border-collapse: separate; width: 100%; mso-cellspacing: 0px; border-spacing: 0px; max-width: 570px; -mru-width: 0px;"
                                  width="570" class="vb-row">
                                  <tbody>
                                      <tr>
                                          <td align="center" valign="top" style="font-size: 0; padding: 0 9px;">
                                              <div style="width: 100%; max-width: 552px; -mru-width: 0px;">
                                                  <!--[if (gte mso 9)|(lte ie 8)]><table align="center" border="0" cellspacing="0" cellpadding="0" width="552"><tr><![endif]-->
                                                  <!--
          -->
                                                  <!--
            -->
                                                  <!--[if (gte mso 9)|(lte ie 8)]><td align="left" valign="top" width="276"><![endif]-->
                                                  <!--
        -->
                                                  <!--[if (gte mso 9)|(lte ie 8)]></td><![endif]-->
                                                  <!--
            -->
                                                  <!--[if (gte mso 9)|(lte ie 8)]><td align="left" valign="top" width="276" class="mobile-hide"><![endif]-->
                                                  <!--
        -->
                                                  <div class="mobile-full mobile-hide" style="display: inline-block; vertical-align: top; width: 100%; max-width: 276px; -mru-width: 0px; min-width: calc(50%); max-width: calc(100%);">
                                                      <!--
          -->
                                                      <table class="vb-content" border="0" cellspacing="9" cellpadding="0" style="border-collapse: separate; width: 100%; mso-cellspacing: 9px; border-spacing: 9px;"
                                                          >
                                                          <tbody>
                                                              <tr>
                                                                  <td width="100%" valign="top" align="center" style="font-weight: normal; color: #ffffff; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: center;">
                                                                      <a href="%5Bshow_link%5D" style="color: #ffffff; text-decoration: underline;display: block;padding: 5px;" target="_new">${
                                                                        vars.company_name
                                                                      } ${new Date().getFullYear()} Todos los derechos reservados</a>
                                                                  </td>
                                                              </tr>
                                                          </tbody>
                                                      </table>
                                                      <!--
        -->
                                                  </div>
                                                  <!--[if (gte mso 9)|(lte ie 8)]></td><![endif]-->
                                                  <!--
          -->
                                                  <!--
        -->
                                                  <!--[if (gte mso 9)|(lte ie 8)]></tr></table><![endif]-->
                                              </div>
                                          </td>
                                      </tr>
                                  </tbody>
                              </table>
                          </div>
                          <!--
      -->
                          <!--[if (gte mso 9)|(lte ie 8)]></td></tr></table><![endif]-->
                      </td>
                  </tr>
              </tbody>
          </table>
          <!-- /footerBlock -->
      </center>
  </body>
  </html>
    `;
};