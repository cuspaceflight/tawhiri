import jinja2

loader = jinja2.PackageLoader('tawhiri', '')
env = jinja2.Environment(loader=loader,
                         extensions=['jinja2.ext.autoescape'],
                         undefined=jinja2.StrictUndefined)
template = env.get_template("template.kml")

def kml(stages, markers, filename=None):
    points = stages[0]
    for stage in stages[1:]:
        assert points[-1] == stage[0]
        points += stage[1:]

    kwargs = {'points': points, 'markers': markers}
    if filename:
        template.stream(**kwargs).dump(filename)
    else:
        template.render(**kwargs)
