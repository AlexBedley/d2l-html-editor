import './d2l-html-editor-plugin.js';

function command(service, editor) {
	var bookmark = editor.selection.getBookmark();
	var mathMl = getSelectedMathMl(editor);
	service.click(mathMl).then(function(response) {
		// setTimeout 10 required for IE to get focus back
		// document.activeELement.blur() required for Chrome to get focus back
		// moveToBookmark required by IE
		setTimeout(function() {
			//Added because IE11 sometimes has undefined or null document.activeElement
			if (document.activeElement) {
				document.activeElement.blur();
			}
			editor.focus();
			editor.selection.moveToBookmark(bookmark);
			editor.execCommand('mceInsertContent', false, response);
		}, 10);
	}, function() {
		setTimeout(function() {
			editor.focus();
			editor.selection.moveToBookmark(bookmark);
			window.D2LHtmlEditor.PolymerBehaviors.Plugin.clearBookmark(editor, bookmark);
		}, 100);
	});
}

function getSelectedMathMl(editor) {
	var mathML = '';
	var node = window.D2LHtmlEditor.PolymerBehaviors.Plugin.getSelectedNode(editor);
	if (node && node.nodeName === 'IMG' && node.className.indexOf('equation') > -1) {
		if (node.attributes.getNamedItem('data-d2l-mathml') !== null) {
			mathML = node.attributes.getNamedItem('data-d2l-mathml').value;
			mathML = decodeURIComponent(mathML);
		}
	}
	return mathML;
}

function convertToMath(obj) {
	var func = function(match) {
		// find the MathML
		var hackRegEx = /^<img[^>]*\s+data-d2l-mathml=\"([^\"]*)\"(.|\n|\r)*/i; // eslint-disable-line no-useless-escape
		var hackResult = hackRegEx.exec(match);
		var hack = decodeURIComponent(hackResult[1]);
		return hack;
	};

	obj.content = obj.content.replace(/<img[^>]*\s+data-d2l-mathml=\"[^\"]*\"[^>]*>/gi, func); // eslint-disable-line no-useless-escape
}

function convertToImages(obj) {
	var classString;
	var func = function(match) {

		var annotationRegex = /<annotation encoding="([^"]*)">/gi;
		var annotationMatch = annotationRegex.exec(match);
		var title = tinymce.EditorManager.i18n.translate('MathML');

		var removeAnnotation = false;
		classString = 'equation';
		if (annotationMatch === null) {
			classString += ' mathmlequation';
			removeAnnotation = true;
		} else {
			if (annotationMatch[1] === 'wiris') {
				classString += ' graphicalequation';
				title = tinymce.EditorManager.i18n.translate('Graphical');
			} else if (annotationMatch[1] === 'wiris-chemistry') {
				classString += ' chemistryequation';
				title = tinymce.EditorManager.i18n.translate('Chemistry equation');
			} else if (annotationMatch[1] === 'latex') {
				classString += ' latexequation';
				title = tinymce.EditorManager.i18n.translate('LaTeX');
			} else {
				classString += ' mathmlequation';
				removeAnnotation = true;
			}
		}
		title = title + ' ' + tinymce.EditorManager.i18n.translate('equation preview image');

		// remove whitespace and annotation markup to reduce query length
		var trimmedMml = match.replace(/>\s+</g, '><');
		if (removeAnnotation) {
			trimmedMml = trimmedMml.replace(/<annotation[\s\S]*<\/annotation>/g, '');
		} else {
			trimmedMml = trimmedMml.replace(/;\s+&/g, ';&');
		}
		var encodedMml = encodeURIComponent(trimmedMml);

		var previewImageSrc = '/wiris/editorservice.aspx/render.png?mml=' + encodedMml;

		// if the image fails to load due to invalid MML or querystring overflow,
		// placeholder symbol is rendered in place via style sheet ":before" event
		var imageHtml = '<img class="' + classString + '" title="' + title + '"'
			+ ' alt="" '
			+ ' src="' + previewImageSrc + '"'
			+ ' data-d2l-mathml="' + encodedMml + '" \/>'; // eslint-disable-line no-useless-escape

		return imageHtml;
	};

	var appletFunc = function(match) {
		var math = match.match(/<math[^>]*>(.|\n|\r)*<\/math>/gi);
		if (math !== null && math.length > 0) {
			math = math[0];
		}
		if (classString.indexOf('graphicalequation') > -1) {
			return func(annotateMathML('wiris', '', math, math));
		}
		return func(annotateMathML('mathml', '', math, math));
	};

	obj.content = obj.content.replace(/<applet[^>]*>(.|\n|\r)*?(<math[^>]*>(.|\n|\r)*?<\/math>)(.|\n|\r)*?<\/applet>/gi, appletFunc);
	obj.content = obj.content.replace(/<math[^>]*>(.|\n|\r)*?<\/math>/gi, func);
}

function htmlEncode(value) {

	if (value === undefined || value === null) {
		return value;
	}

	if (value.indexOf('&') !== -1) {
		value = value.replace(/&/g, '&amp;');
	}
	if (value.indexOf('<') !== -1) {
		value = value.replace(/</g, '&lt;');
	}
	if (value.indexOf('>') !== -1) {
		value = value.replace(/>/g, '&gt;');
	}
	if (value.indexOf('"') !== -1) {
		value = value.replace(/"/g, '&quot;');
	}

	return value;

}

function annotateMathML(encoding, title, originalMath, mathML) {
	if (title === undefined) {
		title = '';
	}

	var mathStartRegEx = /<math[^>]*>/i;
	var mathBlockRegEx = /(display="block"|display='block')/gi;
	var mathStyleRegEx = /(style="(.*?)")/i;
	var mathStart = mathStartRegEx.exec(mathML);
	var mathMLContent = mathML.replace(/<math[^>]*>/gi, '').replace(/<\/math>/gi, '');

	var latexInlineRegEx = /\\\(.*\\\)/gi;

	var mathDisplayStyle = ' display="block"';
	if (!mathBlockRegEx.test(mathStart)) {
		mathDisplayStyle = ' display="inline"';
	}

	if (encoding === 'latex' && latexInlineRegEx.test(originalMath)) {
		mathDisplayStyle = ' display="inline"';
	}

	var mathStyleMatch = mathStyleRegEx.exec(mathStart);
	var style = '';
	var encode = htmlEncode;

	if (mathStyleMatch !== null) {
		style = mathStyleMatch[1];
	}

	var encodedMath = encode(originalMath);

	var annotatedMathML = '<math title="' + title + '" ' + style + ' xmlns="http://www.w3.org/1998/Math/MathML"' +
		mathDisplayStyle + '><semantics><mstyle>' + mathMLContent +
		'</mstyle><annotation encoding=\"' + encoding + '\">' + // eslint-disable-line no-useless-escape
		'{"version":"1.1","math":"' + encodedMath + '"}' +
		'</annotation></semantics></math>';

	return annotatedMathML;

}

function changeButton(editor) {
	if (editor.buttons.d2l_equation.button_object === null) {
		return;
	}

	if (editor.buttons.d2l_equation.setting === 1) {
		editor.buttons.d2l_equation.button_object.title('Graphical equation');
		editor.buttons.d2l_equation.button_object.settings.tooltip = 'Graphical equation';
		editor.buttons.d2l_equation.button_object.icon('d2l_graphical_equation');
		editor.buttons.d2l_equation.button_object.aria('label', tinymce.EditorManager.i18n.translate('Graphical equation'));
		editor.buttons.d2l_equation.button_object.settings.serviceId = 'fra-html-editor-graphical-equation';
	} else if (editor.buttons.d2l_equation.setting === 2) {
		editor.buttons.d2l_equation.button_object.title('Chemistry equation');
		editor.buttons.d2l_equation.button_object.settings.tooltip = 'Chemistry equation';
		editor.buttons.d2l_equation.button_object.icon('d2l_chemistry_equation');
		editor.buttons.d2l_equation.button_object.aria('label', tinymce.EditorManager.i18n.translate('Chemistry equation'));
		editor.buttons.d2l_equation.button_object.settings.serviceId = 'fra-html-editor-chemistry-equation';
	} else if (editor.buttons.d2l_equation.setting === 3) {
		editor.buttons.d2l_equation.button_object.title('MathML equation');
		editor.buttons.d2l_equation.button_object.settings.tooltip = 'MathML equation';
		editor.buttons.d2l_equation.button_object.icon('d2l_mml');
		editor.buttons.d2l_equation.button_object.aria('label', tinymce.EditorManager.i18n.translate('MathML equation'));
		editor.buttons.d2l_equation.button_object.settings.serviceId = 'fra-html-editor-mml-equation';
	} else if (editor.buttons.d2l_equation.setting === 4) {
		editor.buttons.d2l_equation.button_object.title('LaTeX equation');
		editor.buttons.d2l_equation.button_object.settings.tooltip = 'LaTeX equation';
		editor.buttons.d2l_equation.button_object.icon('d2l_latex');
		editor.buttons.d2l_equation.button_object.aria('label', tinymce.EditorManager.i18n.translate('LaTeX equation'));
		editor.buttons.d2l_equation.button_object.settings.serviceId = 'fra-html-editor-latex-equation';
	}
	var btns = document.querySelectorAll('.mce-splitbtn button');
	var length = btns ? btns.length : -1;
	for (var i = 0; i < length; i++) {
		btns[i].setAttribute('role', 'presentation');
	}
}

function changeSetting(editor, setting) {
	if (editor.buttons.d2l_equation.setting !== setting) {
		editor.buttons.d2l_equation.setting = setting;
		if (editor.buttons.d2l_equation.button_object !== null) {
			editor.buttons.d2l_equation.button_object.active(false);
		}
		return true;
	}
	return false;
}

function getEquationMenuItem(editor, setting) {
	var menuItems = editor.menuItems;
	switch (setting) {
		case 1:
			return menuItems.graphical_editor;
		case 2:
			return menuItems.chemistry_editor;
		case 3:
			return menuItems.mml_editor;
		case 4:
			return menuItems.latex_editor;
		default:
			return {};
	}
}

function setIsEnabledByNode(editor, isEnabled, setting) {
	if (editor.buttons.d2l_equation.button_object === null) {
		return;
	} else if (!editor.buttons.d2l_equation.button_object.menu) {
		var menuItem = getEquationMenuItem(editor, setting);
		menuItem.disabled = !isEnabled;
	} else {
		editor.buttons.d2l_equation.button_object.menu._items[setting - 1].disabled(!isEnabled);
	}
}

function setIsActiveByNode(editor, isActive, setting) {
	if (editor.buttons.d2l_equation.button_object === null) {
		return;
	} else if (!editor.buttons.d2l_equation.button_object.menu) {
		var menuItem = getEquationMenuItem(editor, setting);
		menuItem.active = isActive;
	} else {
		editor.buttons.d2l_equation.button_object.menu._items[setting - 1].active(isActive);
	}
}

function nodeChange(e, editor) {
	for (var i = 1; i <= 4; i++) {
		var setting = i;
		var isEnabled = false;
		var isActive = false;

		if (!e.node && e.element) e.node = e.element;
		if (!e.isCollapsed && e.node.nodeName === 'IMG' && (e.node.className.indexOf('equation') > -1)) {
			// Expected Behavior
			// Graphical equation - enabled: Graphical and Chemistry. active: Graphical
			// Chemistry equation - enabled: Graphical and Chemistry. active: Chemistry
			// Mathml - enabled: Mathml. active: Mathml
			// Latex - enabled: Latex. active: Latex
			var data = decodeURIComponent(e.node.getAttribute('data-d2l-mathml')) || '';
			var isGraphicalEquation = data.indexOf('encoding="wiris"') > -1;
			var isChemistryEquation = data.indexOf('encoding="wiris-chemistry"') > -1;
			var isMathmlEquation = data.indexOf('encoding') === -1;
			var isLatexEquation = data.indexOf('encoding="latex"') > -1;

			if (setting === 1 && (isGraphicalEquation || isChemistryEquation)) {
				isEnabled = !getEquationMenuItem(editor, setting).hidden;
				isActive = isEnabled && isGraphicalEquation;
			} else if (setting === 2 && (isChemistryEquation || isGraphicalEquation)) {
				isEnabled = !getEquationMenuItem(editor, setting).hidden;
				isActive = isEnabled && isChemistryEquation;
			} else if (setting === 3 && isMathmlEquation) {
				isEnabled = isActive = !getEquationMenuItem(editor, setting).hidden;
			} else if (setting === 4 && isLatexEquation) {
				isEnabled = isActive = !getEquationMenuItem(editor, setting).hidden;
			}
		} else {
			isEnabled = true;
			if (editor.buttons.d2l_equation.button_object !== null) {
				editor.buttons.d2l_equation.button_object.active(false);
			}
		}

		setIsEnabledByNode(editor, isEnabled, setting);
		setIsActiveByNode(editor, isActive, setting);

		if (isActive) {
			if (changeSetting(editor, setting)) {
				changeButton(editor);
			}
			if (editor.buttons.d2l_equation.button_object !== null) {
				editor.buttons.d2l_equation.button_object.active(true);
			}
		}
	}
}

/*global tinymce:true */
/** @polymerBehavior */
var EquationEditorBehavior = {
	plugin: {
		addPlugin: function(client) {
			var graphicalEditorPromise = new Promise(function(resolve) {
				client.getService('fra-html-editor-graphical-equation', '0.1').then(function(service) {
					return service.config().then(function(config) {
						resolve(config.isEnabled);
					});
				}, function() {
					resolve(false);
				});
			});

			var chemistryEditorPromise = new Promise(function(resolve) {
				client.getService('fra-html-editor-chemistry-equation', '0.1').then(function(service) {
					return service.config().then(function(config) {
						resolve(config.isEnabled);
					});
				}, function() {
					resolve(false);
				});
			});

			var mmlEditorPromise = new Promise(function(resolve) {
				client.getService('fra-html-editor-mml-equation', '0.1').then(function(service) {
					return service.config().then(function(config) {
						resolve(config.isEnabled);
					});
				}, function() {
					resolve(false);
				});
			});

			var latexEditorPromise = new Promise(function(resolve) {
				client.getService('fra-html-editor-latex-equation', '0.1').then(function(service) {
					return service.config().then(function(config) {
						resolve(config.isEnabled);
					});
				}, function() {
					resolve(false);
				});
			});

			return Promise.all([graphicalEditorPromise, chemistryEditorPromise, mmlEditorPromise, latexEditorPromise]).then(function(res) {
				tinymce.PluginManager.add('d2l_equation', function(editor) {
					editor.addMenuItem('graphical_editor', {
						active: false,
						disabled: false,
						hidden: !res[0],
						icon: 'd2l_graphical_equation',
						text: 'Graphical equation',
						serviceId: 'fra-html-editor-graphical-equation',
						button_object: null,
						onPostRender: function() {
							editor.menuItems.graphical_editor.button_object = this;
						},
						onclick: function() {
							var setting = 1;
							var changeButtonState = changeSetting(editor, setting);
							if (changeButtonState === true) {
								changeButton(editor);
							}
							window.D2LHtmlEditor.PolymerBehaviors.Plugin.callIfrauService(client, this.settings.serviceId, editor, command);
						}
					});

					editor.addMenuItem('chemistry_editor', {
						active: false,
						disabled: false,
						hidden: !res[1],
						icon: 'd2l_chemistry_equation',
						text: 'Chemistry equation',
						serviceId: 'fra-html-editor-chemistry-equation',
						button_object: null,
						onPostRender: function() {
							editor.menuItems.chemistry_editor.button_object = this;
						},
						onclick: function() {
							var setting = 2;
							var changeButtonState = changeSetting(editor, setting);
							if (changeButtonState === true) {
								changeButton(editor);
							}
							window.D2LHtmlEditor.PolymerBehaviors.Plugin.callIfrauService(client, this.settings.serviceId, editor, command);
						}
					});

					editor.addMenuItem('mml_editor', {
						active: false,
						disabled: false,
						hidden: !res[2],
						icon: 'd2l_mml',
						text: 'MathML equation',
						serviceId: 'fra-html-editor-mml-equation',
						button_object: null,
						onPostRender: function() {
							editor.menuItems.mml_editor.button_object = this;
						},
						onclick: function() {
							var setting = 3;
							var changeButtonState = changeSetting(editor, setting);
							if (changeButtonState === true) {
								changeButton(editor);
							}
							window.D2LHtmlEditor.PolymerBehaviors.Plugin.callIfrauService(client, this.settings.serviceId, editor, command);
						}
					});

					editor.addMenuItem('latex_editor', {
						active: false,
						disabled: false,
						hidden: !res[3],
						icon: 'd2l_latex',
						text: 'LaTeX equation',
						serviceId: 'fra-html-editor-latex-equation',
						button_object: null,
						onPostRender: function() {
							editor.menuItems.latex_editor.button_object = this;
						},
						onclick: function() {
							var setting = 4;
							var changeButtonState = changeSetting(editor, setting);
							if (changeButtonState === true) {
								changeButton(editor);
							}
							window.D2LHtmlEditor.PolymerBehaviors.Plugin.callIfrauService(client, this.settings.serviceId, editor, command);
						}
					});

					editor.addButton('d2l_equation', {
						title: 'Graphical equation',
						tooltip: 'Graphical equation',
						icon: 'd2l_graphical_equation',
						type: 'splitbutton',
						setting: 1,
						button_object: null,
						serviceId: 'fra-html-editor-graphical-equation',
						menu: [
							editor.menuItems['graphical_editor'],
							editor.menuItems['chemistry_editor'],
							editor.menuItems['mml_editor'],
							editor.menuItems['latex_editor']
						],
						onPostRender: function() {
							editor.buttons.d2l_equation.button_object = this;
							if (editor.buttons.d2l_equation.setting !== 2 || editor.buttons.d2l_equation.setting !== 3 || editor.buttons.d2l_equation.setting !== 4) {
								changeButton(editor);
							}
						},
						onclick: function() {
							window.D2LHtmlEditor.PolymerBehaviors.Plugin.callIfrauService(client, this.settings.serviceId, editor, command);
						}
					});

					editor.on('NodeChange', function(e) {
						nodeChange(e, editor);
					});

					editor.on('BeforeSetContent', function(e) {
						convertToImages(e);
					});

					editor.on('PostProcess', function(e) {
						if (e.get) {
							convertToMath(e);
						}
					});
				});
			});
		}
	}
};

window.D2LHtmlEditor = window.D2LHtmlEditor || {};
window.D2LHtmlEditor.PolymerBehaviors = window.D2LHtmlEditor.PolymerBehaviors || {};
/** @polymerBehavior */
window.D2LHtmlEditor.PolymerBehaviors.EquationEditor = EquationEditorBehavior;
