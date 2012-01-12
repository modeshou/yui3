/**
View class responsible for rendering the `<tbody>` section of a table. Used as
the default `bodyView` for `Y.DataTable.Base` and `Y.DataTable` classes.

Translates the provided `modelList` into a rendered `<tbody>` based on the data
in the constituent Models, altered or ammended by any special column
configurations.

The `columns` configuration, passed to the constructor, determines which
columns will be rendered.

The rendering process involves constructing an HTML template for a complete row
of data, built by concatenating a customized copy of the instance's
`CELL_TEMPLATE` into the `ROW_TEMPLATE` once for each column.  This template is
then populated with values from each Model in the `modelList`, aggregating a
complete HTML string of all row and column data.  A `<tbody>` Node is then created from the markup and any column `nodeFormatter`s are applied.

Supported properties of the column objects include:

  * `key` - Used to link a column to an attribute in a Model.
  * `name` - Used for columns that don't relate to an attribute in the Model
    (`formatter` or `nodeFormatter` only) if the implementer wants a
    predictable name to refer to in their CSS.
  * `formatter` - Used to customize or override the content value from the
    Model.  These do not have access to the cell or row Nodes and should
    return string (HTML) content.
  * `nodeFormatter` - Used to provide content for a cell as well as perform any
    custom modifications on the cell or row Node that could not be performed by
    `formatter`s.  Should be used sparingly for better performance.
  * `emptyCellValue` - String (HTML) value to use if the Model data for a
    column, or the content generated by a `formatter`, is the empty string or
    `undefined`.

Column `formatter`s are passed an object (`o`) with the following properties:

  * `value` - The current value of the column's associated attribute, if any.
  * `data` - An object map of Model keys to their current values.
  * `record` - The Model instance.
  * `column` - The column configuration object for the current column.
  * `classnames` - Initially empty string to allow `formatter`s to add CSS 
    classes to the cell's `<td>`.
  * `rowindex` - The zero-based row number.

They may return a value or update `o.value` to assign specific HTML content.  A
returned value has higher precedence.

Column `nodeFormatter`s are passed an object (`o`) with the following
properties:

  * `value` - The current value of the column's associated attribute, if any.
  * `td` - The `<td>` Node instance.
  * `cell` - The `<div>` liner Node instance if present, otherwise, the `<td>`.
    When adding content to the cell, prefer appending into this property.
  * `data` - An object map of Model keys to their current values.
  * `record` - The Model instance.
  * `column` - The column configuration object for the current column.
  * `rowindex` - The zero-based row number.

They are expected to inject content into the cell's Node directly, including
any "empty" cell content.  Each `nodeFormatter` will have access through the
Node API to all cells and rows in the `<tbody>`, but not to the `<table>`, as
it will not be attached yet.

If a `nodeFormatter` returns `false`, the `o.td` and `o.cell` Nodes will be
`destroy()`ed to remove them from the Node cache and free up memory.  The DOM
elements will remain as will any content added to them.  _It is highly
advisable to always return `false` from your `nodeFormatter`s_.

@module datatable-body
@class BodyView
@namespace DataTable
@extends View
**/
var Lang         = Y.Lang,
    isArray      = Lang.isArray,
    fromTemplate = Lang.sub,
    htmlEscape   = Y.Escape.html,
    toArray      = Y.Array,
    bind         = Y.bind,
    YObject      = Y.Object,

    ClassNameManager = Y.ClassNameManager,
    _getClassName    = ClassNameManager.getClassName;

Y.namespace('DataTable').BodyView = Y.Base.create('tableBody', Y.View, [], {
    // -- Instance properties -------------------------------------------------

    /**
    HTML template used to create table cells.

    @property CELL_TEMPLATE
    @type {HTML}
    @default '<td headers="{headers}" class="{classes}">{content}</td>'
    **/
    CELL_TEMPLATE: '<td headers="{headers}" class="{classes}">{content}</td>',

    /**
    CSS class applied to even rows.  This is assigned at instantiation after
    setting up the `\_cssPrefix` for the instance.
    
    For DataTable, this will be `yui3-datatable-even`.

    @property CLASS_EVEN
    @type {String}
    @default 'yui3-table-even'
    **/
    //CLASS_EVEN: null

    /**
    CSS class applied to odd rows.  This is assigned at instantiation after
    setting up the `\_cssPrefix` for the instance.
    
    When used by DataTable instances, this will be `yui3-datatable-odd`.

    @property CLASS_ODD
    @type {String}
    @default 'yui3-table-odd'
    **/
    //CLASS_ODD: null

    /**
    HTML template used to create table rows.

    @property ROW_TEMPLATE
    @type {HTML}
    @default '<tr id="{clientId}" class="{rowClasses}">{content}</tr>'
    **/
    ROW_TEMPLATE :
        '<tr id="{clientId}" class="{rowClasses}">' +
            '{content}' +
        '</tr>',

    /**
    The object that serves as the source of truth for column and row data.
    This property is assigned at instantiation from the `source` property of
    the configuration object passed to the constructor.

    @property source
    @type {Object}
    @default (initially unset)
    **/
    //TODO: should this be protected?
    //source: null,

    // -- Public methods ------------------------------------------------------

    /**
    Returns the `<td>` Node from the given row and column index.  If there is
    no cell at the given coordinates, `null` is returned.

    @method getCell
    @param {Number} row Zero based index of the row with the target cell
    @param {Number} col Zero based index of the column with the target cell
    @return {Node}
    **/
    getCell: function (row, col) {
        var el    = null,
            tbody = this.get('container');

        if (tbody) {
            el = tbody.getDOMNode().rows[+row];
            el && (el = el.cells[+col]);
        }
        
        return Y.one(el);
    },

    /**
    Builds a CSS class name from the provided tokens.  If the instance is
    created with `cssPrefix` or `source` in the configuration, it will use this
    prefix (the `\_cssPrefix` of the `source` object) as the base token.  This
    allows class instances to generate markup with class names that correspond
    to the parent class that is consuming them.

    @method getClassName
    @param {String} token* Any number of tokens to include in the class name
    @return {String} The generated class name
    **/
    getClassName: function () {
        var args = toArray(arguments);
        args.unshift(this._cssPrefix);
        args.push(true);

        return _getClassName.apply(ClassNameManager, args);
    },

    /**
    Returns the `<tr>` Node from the given row index.  If there is
    no row at the given index, `null` is returned.

    @method getRow
    @param {Number} row Zero based index of the row
    @return {Node}
    **/
    // TODO: Support index as clientId => container.one('> #' + index)?
    getRow: function (index) {
        var tbody = this.get('container');

        return Y.one(tbody && tbody.getDOMNode().rows[+index]);
    },

    /**
    Creates the table's `<tbody>` content by assembling markup generated by
    populating the `ROW\_TEMPLATE`, and `CELL\_TEMPLATE` templates with content
    from the `columns` property and `modelList` attribute.

    The rendering process happens in three stages:

    1. A row template is assembled from the `columns` property (see
       `\_createRowTemplate`)

    2. An HTML string is built up by concatening the application of the data in
       each Model in the `modelList` to the row template. For cells with
       `formatter`s, the function is called to generate cell content. Cells
       with `nodeFormatter`s are ignored. For all other cells, the data value
       from the Model attribute for the given column key is used.  The
       accumulated row markup is then inserted into the container.

    3. If any column is configured with a `nodeFormatter`, the `modelList` is
       iterated again to apply the `nodeFormatter`s.

    Supported properties of the column objects include:

      * `key` - Used to link a column to an attribute in a Model.
      * `name` - Used for columns that don't relate to an attribute in the Model
        (`formatter` or `nodeFormatter` only) if the implementer wants a
        predictable name to refer to in their CSS.
      * `formatter` - Used to customize or override the content value from the
        Model.  These do not have access to the cell or row Nodes and should
        return string (HTML) content.
      * `nodeFormatter` - Used to provide content for a cell as well as perform
        any custom modifications on the cell or row Node that could not be
        performed by `formatter`s.  Should be used sparingly for better
        performance.
      * `emptyCellValue` - String (HTML) value to use if the Model data for a
        column, or the content generated by a `formatter`, is the empty string
        or `undefined`.

    Column `formatter`s are passed an object (`o`) with the following
    properties:

      * `value` - The current value of the column's associated attribute, if
        any.
      * `data` - An object map of Model keys to their current values.
      * `record` - The Model instance.
      * `column` - The column configuration object for the current column.
      * `classnames` - Initially empty string to allow `formatter`s to add CSS 
        classes to the cell's `<td>`.
      * `rowindex` - The zero-based row number.

    They may return a value or update `o.value` to assign specific HTML
    content.  A returned value has higher precedence.

    Column `nodeFormatter`s are passed an object (`o`) with the following
    properties:

      * `value` - The current value of the column's associated attribute, if
        any.
      * `td` - The `<td>` Node instance.
      * `cell` - The `<div>` liner Node instance if present, otherwise, the
        `<td>`.  When adding content to the cell, prefer appending into this
        property.
      * `data` - An object map of Model keys to their current values.
      * `record` - The Model instance.
      * `column` - The column configuration object for the current column.
      * `rowindex` - The zero-based row number.

    They are expected to inject content into the cell's Node directly, including
    any "empty" cell content.  Each `nodeFormatter` will have access through the
    Node API to all cells and rows in the `<tbody>`, but not to the `<table>`,
    as it will not be attached yet.

    If a `nodeFormatter` returns `false`, the `o.td` and `o.cell` Nodes will be
    `destroy()`ed to remove them from the Node cache and free up memory.  The
    DOM elements will remain as will any content added to them.  _It is highly
    advisable to always return `false` from your `nodeFormatter`s_.

    @method render
    @return {BodyView} The instance
    @chainable
    **/
    render: function () {
        var tbody   = this.get('container'),
            data    = this.get('modelList'),
            columns = this.columns;

        // Needed for mutation
        this._createRowTemplate(columns);

        if (tbody && data) {
            tbody.setContent(this._createDataHTML(columns));

            this._applyNodeFormatters(tbody, columns);
        }

        this.bindUI();

        return this;
    },

    // -- Protected and private methods ---------------------------------------
    /**
    Handles changes in the source's columns attribute.  Redraws the table data.

    @method _afterColumnChange
    @param {EventFacade} e The `columnsChange` event object
    @protected
    **/
    // TODO: Preserve existing DOM
    // This will involve parsing and comparing the old and new column configs
    // and reacting to four types of changes:
    // 1. formatter, nodeFormatter, emptyCellValue changes
    // 2. column deletions
    // 3. column additions
    // 4. column moves (preserve cells)
    _afterColumnsChange: function (e) {
        this.columns = this._parseColumns(e.newVal);

        this.render();
    },
    
    /**
    Handles modelList changes, including additions, deletions, and updates.

    Modifies the existing table DOM accordingly.

    @method _afterDataChange
    @param {EventFacade} e The `change` event from the ModelList
    @protected
    **/
    _afterDataChange: function (e) {
        // Baseline view will just rerender the tbody entirely
        this.render();
    },

    /**
    Iterates the `modelList`, and calls any `nodeFormatter`s found in the
    `columns` param on the appropriate cell Nodes in the `tbody`.

    @method _applyNodeFormatters
    @param {Node} tbody The `<tbody>` Node whose columns to update
    @param {Object[]} columns The column configurations
    @protected
    **/
    _applyNodeFormatters: function (tbody, columns) {
        var source = this.source,
            data = this.get('modelList'),
            formatters = [],
            tbodyNode  = tbody.getDOMNode(),
            linerQuery = '.' + this.getClassName('liner'),
            i, len;

        // Only iterate the ModelList again if there are nodeFormatters
        for (i = 0, len = columns.length; i < len; ++i) {
            if (columns[i].nodeFormatter) {
                formatters.push(i);
            }
        }

        if (data && formatters.length) {
            data.each(function (record, index) {
                var formatterData = {
                        data      : record.getAttrs(),
                        record    : record,
                        rowindex  : index
                    },
                    row = tbodyNode.rows[index],
                    i, len, col, key, cell, keep;


                if (row) {
                    for (i = 0, len = formatters.length; i < len; ++i) {
                        cell = Y.one(row.cells[formatters[i]]);

                        if (cell) {
                            col = formatterData.column = columns[formatters[i]];
                            key = col.key || col._yuid;

                            formatterData.value = record.get(key);
                            formatterData.td    = cell;
                            formatterData.cell  = cell.one(linerQuery) || cell;

                            keep = col.nodeFormatter.call(source,formatterData);

                            if (keep === false) {
                                // Remove from the Node cache to reduce
                                // memory footprint.  This also purges events,
                                // which you shouldn't be scoping to a cell
                                // anyway.  You've been warned.  Incidentally,
                                // you should always return false. Just sayin.
                                cell.destroy(true);
                            }
                        }
                    }
                }
            });
        }
    },

    /**
    Binds event subscriptions from the UI and the source (if assigned).

    @method bindUI
    @protected
    **/
    bindUI: function () {
        var handles = this._eventHandles,
            data    = this.get('modelList');

        if (this.source && !handles.columnsChange) {
            handles.columnsChange =
                this.source.after('columnsChange',
                    bind('_afterColumnsChange', this));
        }

        if (!handles.dataChange) {
            handles.dataChange = 
                data.after(['*:change', '*:add', '*:remove', '*:destroy', '*:reset'],
                    bind('_afterDataChange', this));
        }
    },

    /**
    The base token for classes created with the `getClassName` method.

    @property _cssPrefix
    @type {String}
    @default 'yui3-table'
    @protected
    **/
    _cssPrefix: ClassNameManager.getClassName('table'),

    /**
    Iterates the `modelList` and applies each Model to the `\_rowTemplate`,
    allowing any column `formatter` or `emptyCellValue` to override cell
    content for the appropriate column.  The aggregated HTML string is
    returned.

    @method _createDataHTML
    @param {Object[]} columns The column configurations to customize the
                generated cell content or class names
    @return {HTML} The markup for all Models in the `modelList`, each applied
                to the `\_rowTemplate`
    @protected
    **/
    _createDataHTML: function (columns) {
        var data = this.get('modelList'),
            html = '';

        if (data) {
            data.each(function (model, index) {
                html += this._createRowHTML(model, index);
            }, this);
        }

        return html;
    },

    /**
    Applies the data of a given Model, modified by any column formatters and
    supplemented by other template values to the instance's `\_rowTemplate` (see
    `\_createRowTemplate`).  The generated string is then returned.

    The data from Model's attributes is fetched by `getAttrs` and this data
    object is appended with other properties to supply values to {placeholders}
    in the template.  For a template generated from a Model with 'foo' and 'bar'
    attributes, the data object would end up with the following properties
    before being used to populate the `\_rowTemplate`:

      * `clientID` - From Model, used the assign the `<tr>`'s 'id' attribute.
      * `foo` - The value to populate the 'foo' column cell content.  This
        value will be the result of the column's `formatter` if assigned, and
        will default from '' or `undefined` to the value of the column's
        `emptyCellValue` if assigned.
      * `bar` - Same for the 'bar' column cell content.
      * `foo-classes` - String of CSS classes to apply to the `<td>`.
      * `bar-classes` - Same.
      * `rowClasses`  - String of CSS classes to apply to the `<tr>`. This will
        default to the odd/even class per the specified index, but can be
        accessed and ammended by any column formatter via `o.data.rowClasses`.

    Because this object is available to formatters, any additional properties
    can be added to fill in custom {placeholders} in the `\_rowTemplate`.

    @method _createRowHTML
    @param {Model} model The Model instance to apply to the row template
    @param {Number} index The index the row will be appearing
    @return {HTML} The markup for the provided Model, less any `nodeFormatter`s
    @protected
    **/
    _createRowHTML: function (model, index) {
        var data    = model.getAttrs(),
            values  = {},
            source  = this.source || this,
            columns = this.columns,
            i, len, col, token, value, formatterData;

        // TODO: Be consistent and change to row-classes? This could be
        // clobbered by a column named 'row'.
        values.rowClasses = (index % 2) ? this.CLASS_ODD : this.CLASS_EVEN;

        for (i = 0, len = columns.length; i < len; ++i) {
            col   = columns[i];
            value = data[col.key];
            token = col._renderToken || col.key || col._yuid;

            values[token + '-classes'] = '';

            if (col.formatter) {
                formatterData = {
                    value     : value,
                    data      : data,
                    column    : col,
                    record    : model,
                    classnames: '',
                    rowindex  : index
                };

                if (typeof col.formatter === 'string') {
                    // TODO: look for known formatters by string name
                    value = fromTemplate(col.formatter, formatterData);
                } else {
                    // Formatters can either return a value
                    value = col.formatter.call(source, formatterData);

                    // or update the value property of the data obj passed
                    if (value === undefined) {
                        value = formatterData.value;
                    }

                    values[token + '-classes'] = formatterData.classnames;
                }
            }

            if ((value === undefined || value === '')) {
                value = col.emptyCellValue || '';
            }

            values[token] = col.allowHTML ? value : htmlEscape(value);
        }

        return fromTemplate(this._rowTemplate, values);
    },

    /**
    Creates a custom HTML template string for use in generating the markup for
    individual table rows with {placeholder}s to capture data from the Models
    in the `modelList` attribute or from column `formatter`s.

    Assigns the `\_rowTemplate` property.

    @method _createRowTemplate
    @param {Object[]} columns Array of column configuration objects
    @protected
    **/
    _createRowTemplate: function (columns) {
        var html         = '',
            cellTemplate = this.CELL_TEMPLATE,
            tokens       = {},
            i, len, col, key, token, tokenValues;

        for (i = 0, len = columns.length; i < len; ++i) {
            col = columns[i];
            key = col.key;

            if (key) {
                if (tokens[key]) {
                    token = key + (tokens[key]++);
                } else {
                    token = key;
                    tokens[key] = 1;
                }
            } else {
                token = col.name || col._yuid;
            }

            col._renderToken = token;

            tokenValues = {
                content   : '{' + token + '}',
                headers   : col.headers.join(' '),
                // TODO: should this be getClassName(token)? Both?
                classes   : this.getClassName(key) + ' {' + token + '-classes}'
            };

            if (col.nodeFormatter) {
                // Defer all node decoration to the formatter
                tokenValues.content    = '';
                tokenValues.classes    = '';
            }

            html += fromTemplate(cellTemplate, tokenValues);
        }

        this._rowTemplate = fromTemplate(this.ROW_TEMPLATE, {
            content: html
        });
    },

    /**
    Destroys the instance.

    @method destructor
    @protected
    **/
    destructor: function () {
        (new Y.EventHandle(YObject.values(this._eventHandles))).detach();
    },

    /**
    Holds the event subscriptions needing to be detached when the instance is
    `destroy()`ed.

    @property _eventHandles
    @type {Object}
    @default undefined (initially unset)
    @protected
    **/
    //_eventHandles: null,

    /**
    Initializes the instance. Reads the following configuration properties in
    addition to the instance attributes:

      * `columns` - (REQUIRED) The initial column information
      * `cssPrefix` - The base string for classes generated by `getClassName`
      * `source` - The object to serve as source of truth for column info

    @method initializer
    @param {Object} config Configuration data
    @protected
    **/
    initializer: function (config) {
        var cssPrefix = config.cssPrefix || (config.source || {}).cssPrefix;

        this.source  = config.source;
        this.columns = this._parseColumns(config.columns);

        this._eventHandles = {};

        if (cssPrefix) {
            this._cssPrefix = cssPrefix;
        }

        this.CLASS_ODD  = this.getClassName('odd');
        this.CLASS_EVEN = this.getClassName('even');
    },

    /**
    Flattens an array of potentially nested column configurations into a single
    depth array of data columns.  Columns that have children are disregarded in
    favor of searching their child columns.  The resulting array corresponds 1:1
    with columns that will contain data in the `<tbody>`.

    @method _parseColumns
    @param {Object[]} data Array of unfiltered column configuration objects
    @param {Object[]} columns Working array of data columns. Used for recursion.
    @return {Object[]} Only those columns that will be rendered.
    @protected
    **/
    _parseColumns: function (data, columns) {
        var col, i, len;
        
        columns || (columns = []);

        if (isArray(data) && data.length) {
            for (i = 0, len = data.length; i < len; ++i) {
                col = data[i];

                if (typeof col === 'string') {
                    col = { key: col };
                }

                if (col.key || col.formatter || col.nodeFormatter) {
                    col.index = columns.length;
                    columns.push(col);
                } else if (col.children) {
                    this._parseColumns(col.children, columns);
                }
            }
        }

        return columns;
    }

    /**
    The HTML template used to create a full row of markup for a single Model in
    the `modelList` plus any customizations defined in the column
    configurations.

    @property _rowTemplate
    @type {HTML}
    @default (initially unset)
    @protected
    **/
    //_rowTemplate: null
});
