export default ( title, gvglobal, path) => {
    let scripts = `<script src="${path}vendor.bundle.js" type="application/javascript"></script>
                   <script src="${path}ag-grid.bundle.js" type="application/javascript"></script>
                   <script src="${path}main.bundle.js" type="application/javascript"></script>`;

    let styles = `<link rel="stylesheet" type="text/css" href="${path}main.css"/>`;

    if(process.env.NODE_ENV === "development") {
        scripts = `<script src="${path}grassvalley.bundle.js" type="application/javascript"></script>
                   ${scripts}`;
        styles = `<link rel="stylesheet" type="text/css" href="${path}grassvalley.css"/>
                  ${styles}`;
    }

	return `
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="utf-8">	  
		<title>${title}</title>
		<base href="${path}">
		<link rel="shortcut icon" type="image/x-icon" href="${path}favicon.ico"/>
		<link rel="icon" type="image/x-icon" href="${path}favicon.ico"/>
		${styles}
	</head>
	<body>
		<div id="app">App Mount Point</div>
	</body>
	<script type="application/javascript">window.__GVCONFIG__ = ${gvglobal}</script>
	${scripts}
</html>`;
};

